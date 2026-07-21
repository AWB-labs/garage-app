-- Garage core schema.
--
-- Design notes that are load bearing, read before editing:
--
-- 1. Primary keys are TEXT, not uuid. The client mints ids offline with
--    newId() in src/lib/id.ts ("mfd3k2-a8f2x9q1"), and offline-first means a
--    row must have its final id before it has ever seen a server. Do not
--    "upgrade" these to uuid: it would break every existing local row.
--
-- 2. Every synced table carries updated_at and deleted_at. updated_at drives
--    the pull cursor, deleted_at is a tombstone so a delete on one device
--    reaches the others. Hard deletes never propagate, so the client turns a
--    delete into a deleted_at stamp.
--
-- 3. Photo columns are deliberately absent. Photos stay on the device that
--    took them (a file:// path means nothing on another phone). If photo sync
--    is ever wanted, it needs Supabase Storage plus an upload queue, not a
--    text column full of dead local paths.
--
-- 4. cost is double precision to mirror the SQLite REAL column exactly. The
--    client is the compute engine for every total, so numeric here would buy
--    precision the app never uses while introducing number/string ambiguity
--    across PostgREST.

create schema if not exists app;
comment on schema app is
  'Internal helpers for row level security. Not exposed through PostgREST.';

-- Profiles -------------------------------------------------------------------

-- Mirrors auth.users so that member lists can be rendered (you cannot select
-- from auth.users as an ordinary user) and so PostgREST has a public table to
-- embed against.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (lower(email));

-- Vehicles -------------------------------------------------------------------

create table public.vehicles (
  id              text primary key,
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  make            text not null,
  model           text not null,
  year            integer not null,
  nickname        text,
  plate           text,
  vin             text,
  current_mileage integer not null default 0,
  created_at      timestamptz not null,
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index vehicles_owner_idx on public.vehicles (owner_id);
create index vehicles_updated_idx on public.vehicles (updated_at);

-- Membership -----------------------------------------------------------------

-- A car is added by one person who can then add others to it. The owner is
-- itself a row here (written by the trigger below), so every access check is
-- the same lookup and there is no "owner_id or member" special case anywhere.
create table public.vehicle_members (
  vehicle_id text not null references public.vehicles (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('owner', 'editor', 'viewer')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (vehicle_id, user_id)
);

create index vehicle_members_user_idx on public.vehicle_members (user_id);

-- Exactly one owner per car. Transferring ownership means demoting the old
-- owner in the same transaction as promoting the new one.
create unique index vehicle_members_one_owner
  on public.vehicle_members (vehicle_id)
  where role = 'owner';

-- Invitations ----------------------------------------------------------------

-- Used only when the invited email has no account yet. If the person already
-- has a profile, invite_to_vehicle() adds the membership directly and no row
-- is written here.
create table public.vehicle_invites (
  id          text primary key,
  vehicle_id  text not null references public.vehicles (id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('editor', 'viewer')),
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days'
);

create unique index vehicle_invites_unique on public.vehicle_invites (vehicle_id, lower(email));
create index vehicle_invites_email_idx on public.vehicle_invites (lower(email));

-- Car data -------------------------------------------------------------------

create table public.service_records (
  id           text primary key,
  vehicle_id   text not null references public.vehicles (id) on delete cascade,
  type         text not null check (type in ('oil', 'tires', 'brakes', 'filters', 'battery', 'inspection', 'custom')),
  custom_label text,
  date         timestamptz not null,
  mileage      integer not null,
  cost         double precision,
  shop         text,
  notes        text,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table public.reminder_rules (
  id                 text primary key,
  vehicle_id         text not null references public.vehicles (id) on delete cascade,
  service_type       text not null check (service_type in ('oil', 'tires', 'brakes', 'filters', 'battery', 'inspection', 'custom')),
  custom_label       text,
  mileage_interval   integer,
  time_interval_days integer,
  last_done_mileage  integer,
  last_done_date     timestamptz,
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create table public.issues (
  id                     text primary key,
  vehicle_id             text not null references public.vehicles (id) on delete cascade,
  title                  text not null,
  description            text not null default '',
  severity               text not null check (severity in ('low', 'medium', 'critical')),
  status                 text not null default 'open' check (status in ('open', 'monitoring', 'fixed')),
  created_at             timestamptz not null,
  -- Intentionally not a foreign key, matching SQLite: deleting the service
  -- must not delete the issue. The client nulls this by hand on delete, and
  -- the unlink_resolved_service trigger in the sharing migration repairs the
  -- case where another device was the one that did the deleting.
  resolved_by_service_id text,
  resolved_at            timestamptz,
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);

create table public.notes (
  id         text primary key,
  vehicle_id text not null references public.vehicles (id) on delete cascade,
  body       text not null,
  pinned     boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.mileage_logs (
  id         text primary key,
  vehicle_id text not null references public.vehicles (id) on delete cascade,
  mileage    integer not null,
  date       timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index service_records_vehicle_idx on public.service_records (vehicle_id, updated_at);
create index reminder_rules_vehicle_idx on public.reminder_rules (vehicle_id, updated_at);
create index issues_vehicle_idx on public.issues (vehicle_id, updated_at);
create index notes_vehicle_idx on public.notes (vehicle_id, updated_at);
create index mileage_logs_vehicle_idx on public.mileage_logs (vehicle_id, updated_at);

-- Settings -------------------------------------------------------------------

-- Per user, not per car. Mirrors the local key/value settings table as one row
-- so a second device inherits theme, units, and currency on sign in.
create table public.user_settings (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  theme         text not null default 'system' check (theme in ('system', 'dark', 'light')),
  unit          text not null default 'km' check (unit in ('km', 'mi')),
  currency      text not null default 'EGP',
  car_image_key text not null default '',
  updated_at    timestamptz not null default now()
);

-- Triggers -------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_profiles         before update on public.profiles         for each row execute function app.touch_updated_at();
create trigger touch_vehicles         before update on public.vehicles         for each row execute function app.touch_updated_at();
create trigger touch_vehicle_members  before update on public.vehicle_members  for each row execute function app.touch_updated_at();
create trigger touch_service_records  before update on public.service_records  for each row execute function app.touch_updated_at();
create trigger touch_reminder_rules   before update on public.reminder_rules   for each row execute function app.touch_updated_at();
create trigger touch_issues           before update on public.issues           for each row execute function app.touch_updated_at();
create trigger touch_notes            before update on public.notes            for each row execute function app.touch_updated_at();
create trigger touch_mileage_logs     before update on public.mileage_logs     for each row execute function app.touch_updated_at();
create trigger touch_user_settings    before update on public.user_settings    for each row execute function app.touch_updated_at();

-- The person who inserts a car becomes its owner member. Doing this in a
-- trigger rather than in the client means the ownership row cannot be
-- forgotten, and it cannot be forged: it always names the inserting user.
create or replace function app.claim_new_vehicle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.vehicle_members (vehicle_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (vehicle_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

create trigger claim_new_vehicle
  after insert on public.vehicles
  for each row execute function app.claim_new_vehicle();

-- Two things an editor must not be able to do through a plain update.
--
-- owner_id anchors the ownership row, so letting it move would hand the car to
-- somebody else. And deleting a car is a tombstone, which is an UPDATE of
-- deleted_at rather than a DELETE: the owner only delete policy does not cover
-- it, so the check has to live here or an editor could delete a shared car out
-- from under its owner.
create or replace function app.guard_vehicle_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'vehicles.owner_id is immutable, transfer ownership through vehicle_members'
      using errcode = '42501';
  end if;

  -- auth.uid() is null for the service role and for SQL run in the dashboard,
  -- where there is no member row to find and no user to police.
  if new.deleted_at is distinct from old.deleted_at
     and (select auth.uid()) is not null
     and not exists (
       select 1 from public.vehicle_members m
       where m.vehicle_id = new.id
         and m.user_id = (select auth.uid())
         and m.role = 'owner'
     )
  then
    raise exception 'only the owner of a car can delete it' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger guard_vehicle_update
  before update on public.vehicles
  for each row execute function app.guard_vehicle_update();

-- Mirror auth.users into profiles ---------------------------------------------

create or replace function app.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  -- The existing row is referenced by relation name, not schema qualified:
  -- inside ON CONFLICT DO UPDATE the target's alias is just "profiles".
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, profiles.display_name);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.sync_profile_from_auth();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function app.sync_profile_from_auth();
