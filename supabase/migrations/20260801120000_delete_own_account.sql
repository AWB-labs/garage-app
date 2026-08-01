-- Lets a signed in account delete itself.
--
-- There is no service role key on the phone, so the client cannot call the
-- Auth admin API the way scripts/verify-backend.mjs deletes its throwaway
-- accounts. A SECURITY DEFINER function that only ever touches auth.uid()'s
-- own row is the self-service equivalent: it grants nothing a caller could
-- not already ask a human with dashboard access to do for them.
--
-- Deleting the auth.users row cascades in two different shapes depending on
-- what the account is to a given car, and neither needs help from this
-- function:
--
--   - Owned: vehicles.owner_id references profiles(id) on delete cascade, so
--     every car this account owns goes with it, hard deleted, and from each
--     car every service_records / reminder_rules / issues / notes /
--     mileage_logs / vehicle_members row that pointed at it goes too. The two
--     triggers that ride along, unlink_resolved_service and
--     unlink_deleted_service, are already SECURITY DEFINER from
--     20260721120400, for exactly this reason: an ordinary trigger fired by a
--     cascade runs as whoever is holding the knife, and here that is this
--     function's owner rather than supabase_auth_admin, but the fix already
--     in place covers either one.
--   - Shared with, not owned: vehicle_members.user_id references profiles(id)
--     on delete cascade, so only this account's own membership row goes. The
--     car and everything logged against it stay, because nothing in this
--     schema ties a service record, issue, note, or mileage log to the person
--     who entered it, only to the vehicle. That is what makes "the car
--     survives, what you logged on it survives" true for free, not something
--     this function has to arrange.
--
-- What this function deliberately does not do is tombstone owned cars before
-- deleting the account. It could: update the deleted_at of every car this
-- account owns, then delete from auth.users, in the same call. But that
-- update would commit in the same transaction as the delete that follows it,
-- so no other session could ever read the tombstoned-but-not-yet-cascaded
-- state; it would be exactly as invisible to a co-owner's next pull as no
-- tombstone at all. The client is expected to tombstone and push its owned
-- cars the ordinary way before it ever calls this (useGarageStore.deleteVehicle,
-- then a sync push: see deleteAccountAndClearLocal in src/sync/engine.ts),
-- which at least gives other members' next pull a chance to land in the gap
-- between the two, the same best effort sign out already makes for the
-- outbox before it clears a phone.
--
-- Not verified against the live database yet: apply this migration and run
-- npm run verify:backend, which now covers both shapes (an owner deleting
-- their own account, and a non-owner deleting theirs) before shipping it.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from auth.users where id = v_caller;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
