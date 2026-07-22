# Backend setup

Garage runs with or without a backend. With no credentials it is the original
local-first app: everything on the phone, no accounts, no sync, no sign in
screen. Adding credentials turns on accounts, multi device sync, and sharing a
car with other people.

**Status: applied and tested** against a live project in `eu-west-1`. All five
migrations are on it, and the database was left empty afterwards. The project
URL and anon key live in `.env`, which is not committed. What this does and does
not prove is at the bottom of this file.

## Applying the migrations

With the Supabase CLI, from the repo root:

```bash
supabase db push --db-url "postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres"
```

or `supabase link --project-ref <ref>` then `supabase db push`. Use port 5432,
the session pooler, not 6543: transaction mode does not suit DDL.

They must run in filename order. Each one depends on the one before it:

| File | What it does |
|---|---|
| `20260721120000_core_schema.sql` | Tables, indexes, `updated_at` triggers, the trigger that mirrors `auth.users` into `profiles`, and the trigger that makes whoever inserts a car its owner |
| `20260721120100_access_policies.sql` | Row level security: the `app` schema helpers and a policy on every table |
| `20260721120200_sharing_functions.sql` | `invite_to_vehicle`, `claim_pending_invites`, and the triggers that unlink an issue from a deleted service |
| `20260721120300_owner_sees_own_vehicle.sql` | Fixes car creation failing under `INSERT ... RETURNING` |
| `20260721120400_unlink_trigger_privileges.sql` | Fixes accounts that own a car being impossible to delete |

The last two exist because the first three were wrong in ways only a live
database could show. Both are written up under Traps below. Do not fold them
back into the earlier files: a migration set that has run somewhere is history,
not a draft.

## Pointing the app at it

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from
Project Settings > API. Restart the bundler afterwards: `EXPO_PUBLIC_` values
are inlined at build time, so an already running Metro will keep serving the
old ones.

## 4. Auth settings

Authentication > Providers > Email. Email and password is the only method wired
up, because native Google and Apple sign in cannot run inside Expo Go and the
project is pinned to Expo Go on SDK 54.

**Leave Confirm email on.** It is not the usual "nice to have" here. Sharing
matches invitations on the address in `auth.users`, so an unverified email means
somebody can sign up as your address and claim cars shared with you.
`claim_pending_invites()` would hand the car over. Verification is what makes
the sharing model safe.

### The confirmation email must send a code, not a link

**Authentication > Email Templates > Confirm signup.** Replace the
`{{ .ConfirmationURL }}` link with `{{ .Token }}`, for example:

```html
<h2>Confirm your email</h2>
<p>Enter this code in Garage to finish setting up your account:</p>
<p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
```

A link cannot work here. It has to return to the app through a custom scheme,
and Expo Go answers to `exp://` on a LAN address that changes with the machine,
so the link lands nowhere. Worse, out of the box it lands on **`http://localhost:3000`**,
which is Supabase's default Site URL: the account really is confirmed, the
person just ends up staring at a dead page with no way back.

A typed code needs no deep link and behaves identically in Expo Go and a store
build. `src/app/sign-in.tsx` asks for it and `verifyCode` in
`src/stores/auth.ts` calls `verifyOtp({ type: 'signup' })`.

**The code is eight digits on this project, not six.** Verified against the
live project, whatever the docs imply. It is the Auth OTP length setting; if
you change it, update `CODE_LENGTH` in `src/app/sign-in.tsx`. Only the
auto-submit depends on the exact value, so a mismatch costs one extra tap
rather than making the screen impossible to finish.

Site URL then only matters for password recovery, which this app does not use
yet. Point it somewhere real before adding one.

## The data model

```
auth.users
  └── profiles                 mirror, so member lists can show who somebody is
        └── vehicles           owner_id, one row per car
              ├── vehicle_members    (vehicle_id, user_id) -> owner | editor | viewer
              ├── vehicle_invites    an email with no account yet
              ├── service_records
              ├── reminder_rules
              ├── issues
              ├── notes
              └── mileage_logs
        └── user_settings      theme, units, currency, imagery key
```

Access is one sentence: **you can see a car if you have a row in
`vehicle_members` for it, and every child row inherits that answer from its
car.** The owner is a membership row like anybody else, written by a trigger on
insert, so there is no "owner or member" special case in any policy.

| Role | Can |
|---|---|
| owner | everything, including sharing the car and deleting it |
| editor | log services, issues, notes, mileage; edit the car's details |
| viewer | read |

## Traps found by running it

Both of these passed review, typechecked, and bundled. Only a real database
caught them, which is the argument for testing against one.

**`INSERT ... RETURNING` is also a SELECT.** Creating a car failed with `new row
violates row-level security policy for table "vehicles"` even though the insert
policy plainly allowed it. The RETURNING clause makes Postgres check the SELECT
policy against the new row, and the thing that makes a car visible, its owner
membership, is written by an AFTER INSERT trigger that has not fired yet. The
same insert without RETURNING succeeded. `vehicles_select` now also matches on
`owner_id` directly. The trigger cannot move to BEFORE INSERT instead, because
`vehicle_members` has a foreign key to `vehicles` and the car must exist first.

The client only avoided this because supabase-js sends `Prefer: return=minimal`
unless you call `.select()`. Adding `.select()` to the upsert in
`src/sync/engine.ts` would have broken car creation with an error pointing at
the wrong thing entirely.

**Cascading deletes fire your triggers as somebody else.** Deleting an account
returned `Database error deleting user`, but only for accounts that owned a car
with service records. Referential actions run as the table owner, so the cascade
itself was fine; the AFTER DELETE trigger it fired was not, because an ordinary
trigger function runs as the *current* user, and that user is
`supabase_auth_admin`, the role GoTrue connects as. It has no rights on
`public.issues`, so `unlink_deleted_service` failed and took the delete with it,
leaving accounts that nothing could remove. Both unlink triggers are now
SECURITY DEFINER.

The general rule: **any trigger that touches a second table must be SECURITY
DEFINER if it can be reached through a cascade**, because you do not control
which role will be holding the knife.

## Things worth knowing before you change any of it

**Primary keys are `text`, not `uuid`.** The client mints ids offline in
`src/lib/id.ts` and a row must have its final id before it has ever seen a
server. Changing this breaks every row already on a phone.

**Photos are not in the schema at all.** A `file://` path means nothing on
another device, so photos stay where they were taken. Syncing them needs
Supabase Storage and an upload queue, not a text column of dead paths.

**RLS helpers are `SECURITY DEFINER` and return `SETOF`.** Both properties are
load bearing. A policy on `vehicle_members` that reads `vehicle_members` makes
Postgres re-apply the same policy to the inner read and the query dies with
"infinite recursion detected in policy"; running as the definer stops that.
Returning a set means policies say `x in (select app.f())`, which Postgres
evaluates once per query instead of once per row.

Do not add `FORCE ROW LEVEL SECURITY` to these tables. The triggers rely on
definer functions bypassing RLS as the table owner, and forcing it would break
car creation.

**Deleting a car is an UPDATE, not a DELETE.** Deletes are tombstones
(`deleted_at`) because a hard delete cannot propagate to another device. That
means the owner-only delete policy does not cover it, which is why
`guard_vehicle_update` checks ownership on `deleted_at` as well as `owner_id`.

**Tombstones are never purged.** For a personal maintenance log that is fine
for years. If it ever matters, delete rows with `deleted_at < now() - interval
'90 days'` on a schedule, and understand that a device which has not synced
since before the cutoff will not learn about those deletions.

## Known gaps

**Nobody emails the invited person.** `invite_to_vehicle` records the invitation
and `claim_pending_invites` turns it into access the moment that email signs up,
but the person has to already know to go and create an account. Sending the mail
needs `auth.admin.inviteUserByEmail`, which needs the service role key, which
must never ship inside the app. The fix is an Edge Function holding that key and
called from the client. Until then, tell them yourself.

**No realtime.** A change made by somebody else arrives on the next sync: on
foreground, when the connection returns, about a second after a local edit, or
on the sixty second timer. For a shared car that is usually indistinguishable
from instant. Subscribing to Postgres changes would tighten it, at the cost of a
socket to keep alive and reconcile against.

**Tombstones are never purged**, as described above.

## Re-checking it

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_ANON_KEY=<anon> \
SUPABASE_SERVICE_ROLE_KEY=<service-role> \
npm run verify:backend
```

48 checks. It creates throwaway accounts, drives every policy and both roles
through PostgREST with real JWTs, and deletes everything afterwards including
on failure. Run it after any change to a migration or to `src/sync`.

Note the variable names have no `EXPO_PUBLIC_` prefix, and must not gain one:
that prefix is what makes Expo inline a value into the app bundle, and the
service role key bypasses every policy here.

## What has been verified, and what has not

Verified against the live database, with real accounts and real JWTs over
PostgREST, the same path the app takes:

- Every table has RLS on, with policies. Every function has a locked
  `search_path`, and SECURITY DEFINER only where the design calls for it.
- A stranger sees nothing: no cars, no service records, no profiles, and cannot
  write to a car they cannot see.
- Sharing with an existing account grants access immediately. Sharing with an
  unknown email parks an invitation, which the RPC turns into real access on
  that person's first sign in, and the invitation row is consumed.
- An editor can log work but cannot re-share the car, take ownership, promote
  themselves, or delete the car by tombstoning it. A viewer can read but not
  write. Removing somebody takes the car away; they can also leave on their own.
  The owner's membership row cannot be deleted, so a car cannot be orphaned.
- Deleting a service unlinks the issue that pointed at it, server side.
- `updated_at` moves on every write and a cursor query returns exactly the
  changed row, which is what the pull relies on. `cost` survives the round trip
  as a number, and tombstoned rows still come back so other devices learn of
  the delete.
- Settings are per account and unreadable and unwritable by anyone else.
- The invite RPC rejects the owner role, a malformed email, and sharing with
  yourself.
- An account deletes cleanly, cascade and triggers included.
- The exact supabase-js query builders in `src/sync/engine.ts` and
  `src/sync/sharing.ts` all run, including the member list embed.

**Not verified: the app itself on a phone.** Nothing here exercised the sync
engine's own logic, only the queries it makes. The outbox, the cursor
bookkeeping, the reconcile pass, the first sign in adoption, the route gate, and
the sheets and gestures around them have never run on a device. In particular:

- No sync cycle has ever executed end to end.
- The local SQLite migration that adds `vehicles.role` to an existing install
  has not been run against a database that already had rows.
- Airplane mode, and the outbox draining afterwards, is untested.

That is the next thing to do, and it needs a phone.
