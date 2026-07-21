-- Row level security for Garage.
--
-- The whole model is one sentence: you can see a car if you have a row in
-- vehicle_members for it, and every child row inherits that answer from its
-- vehicle. Roles are owner (added the car, can share it), editor (can log
-- work), viewer (read only).
--
-- Two traps this file is written to avoid:
--
-- 1. Recursion. A policy on vehicle_members that reads vehicle_members makes
--    Postgres re-apply the same policy to the inner read and the query dies
--    with "infinite recursion detected in policy". Every membership lookup
--    therefore goes through a SECURITY DEFINER function in the app schema.
--    Because the function runs as its owner, the inner read is not policed.
--
-- 2. Per row function calls. Helpers return SETOF and are used as
--    "x in (select app.f())" rather than a boolean called with the row's id.
--    With no arguments and a stable marking, Postgres evaluates them once per
--    query as an InitPlan instead of once per row.
--
-- Do not add FORCE ROW LEVEL SECURITY to these tables. The triggers in the
-- core schema migration rely on definer functions bypassing RLS as the table
-- owner, and forcing it would break vehicle creation.

-- Helpers ---------------------------------------------------------------------

create or replace function app.my_vehicle_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select m.vehicle_id
  from public.vehicle_members m
  where m.user_id = (select auth.uid());
$$;

create or replace function app.my_writable_vehicle_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select m.vehicle_id
  from public.vehicle_members m
  where m.user_id = (select auth.uid())
    and m.role in ('owner', 'editor');
$$;

create or replace function app.my_owned_vehicle_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select m.vehicle_id
  from public.vehicle_members m
  where m.user_id = (select auth.uid())
    and m.role = 'owner';
$$;

-- Everyone who shares at least one car with you. Drives the members list:
-- without it you could read the membership row but not the person's name.
create or replace function app.my_covisible_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct m.user_id
  from public.vehicle_members m
  where m.vehicle_id in (
    select vm.vehicle_id
    from public.vehicle_members vm
    where vm.user_id = (select auth.uid())
  );
$$;

-- Read from auth.users rather than the JWT claim: the token can carry an email
-- the user has since changed, and invites are matched on it.
create or replace function app.my_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email)
  from auth.users u
  where u.id = (select auth.uid());
$$;

revoke all on schema app from public;
grant usage on schema app to anon, authenticated;

revoke all on function
  app.my_vehicle_ids(),
  app.my_writable_vehicle_ids(),
  app.my_owned_vehicle_ids(),
  app.my_covisible_user_ids(),
  app.my_email()
from public;

-- anon is granted execute too so that a signed out request evaluates to an
-- empty set and returns no rows, instead of failing with a permission error.
grant execute on function
  app.my_vehicle_ids(),
  app.my_writable_vehicle_ids(),
  app.my_owned_vehicle_ids(),
  app.my_covisible_user_ids(),
  app.my_email()
to anon, authenticated;

-- Grants ----------------------------------------------------------------------

-- Supabase's default privileges hand new public tables to anon as well. Garage
-- has no signed out surface, so anon is revoked and only authenticated keeps
-- DML. RLS is still the real boundary; this is the belt to its braces.
revoke all on all tables in schema public from anon;

grant select, insert, update, delete on
  public.profiles,
  public.vehicles,
  public.vehicle_members,
  public.vehicle_invites,
  public.service_records,
  public.reminder_rules,
  public.issues,
  public.notes,
  public.mileage_logs,
  public.user_settings
to authenticated;

alter table public.profiles         enable row level security;
alter table public.vehicles         enable row level security;
alter table public.vehicle_members  enable row level security;
alter table public.vehicle_invites  enable row level security;
alter table public.service_records  enable row level security;
alter table public.reminder_rules   enable row level security;
alter table public.issues           enable row level security;
alter table public.notes            enable row level security;
alter table public.mileage_logs     enable row level security;
alter table public.user_settings    enable row level security;

-- Profiles --------------------------------------------------------------------

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or id in (select app.my_covisible_user_ids()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No insert or delete policy on purpose: rows are created and removed by the
-- auth.users triggers, so a client cannot invent a profile for an email it
-- does not control.

-- Vehicles --------------------------------------------------------------------

create policy vehicles_select on public.vehicles
  for select to authenticated
  using (id in (select app.my_vehicle_ids()));

create policy vehicles_insert on public.vehicles
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy vehicles_update on public.vehicles
  for update to authenticated
  using (id in (select app.my_writable_vehicle_ids()))
  with check (id in (select app.my_writable_vehicle_ids()));

create policy vehicles_delete on public.vehicles
  for delete to authenticated
  using (id in (select app.my_owned_vehicle_ids()));

-- Membership ------------------------------------------------------------------

create policy vehicle_members_select on public.vehicle_members
  for select to authenticated
  using (vehicle_id in (select app.my_vehicle_ids()));

-- role <> 'owner' guards the ownership row on every write path: it cannot be
-- inserted a second time, edited, or removed through the API, which keeps the
-- one owner per car invariant true without a trigger.
create policy vehicle_members_insert on public.vehicle_members
  for insert to authenticated
  with check (vehicle_id in (select app.my_owned_vehicle_ids()) and role <> 'owner');

create policy vehicle_members_update on public.vehicle_members
  for update to authenticated
  using (vehicle_id in (select app.my_owned_vehicle_ids()) and role <> 'owner')
  with check (vehicle_id in (select app.my_owned_vehicle_ids()) and role <> 'owner');

-- The owner removes people, and anybody else can remove themselves to leave a
-- car they were added to.
create policy vehicle_members_delete on public.vehicle_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (
      vehicle_id in (select app.my_owned_vehicle_ids())
      or user_id = (select auth.uid())
    )
  );

-- Invites ---------------------------------------------------------------------

create policy vehicle_invites_select on public.vehicle_invites
  for select to authenticated
  using (
    vehicle_id in (select app.my_owned_vehicle_ids())
    or lower(email) = app.my_email()
  );

create policy vehicle_invites_insert on public.vehicle_invites
  for insert to authenticated
  with check (vehicle_id in (select app.my_owned_vehicle_ids()));

create policy vehicle_invites_delete on public.vehicle_invites
  for delete to authenticated
  using (
    vehicle_id in (select app.my_owned_vehicle_ids())
    or lower(email) = app.my_email()
  );

-- Car data --------------------------------------------------------------------

create policy service_records_select on public.service_records
  for select to authenticated using (vehicle_id in (select app.my_vehicle_ids()));
create policy service_records_insert on public.service_records
  for insert to authenticated with check (vehicle_id in (select app.my_writable_vehicle_ids()));
create policy service_records_update on public.service_records
  for update to authenticated
  using (vehicle_id in (select app.my_writable_vehicle_ids()))
  with check (vehicle_id in (select app.my_writable_vehicle_ids()));
create policy service_records_delete on public.service_records
  for delete to authenticated using (vehicle_id in (select app.my_writable_vehicle_ids()));

create policy reminder_rules_select on public.reminder_rules
  for select to authenticated using (vehicle_id in (select app.my_vehicle_ids()));
create policy reminder_rules_insert on public.reminder_rules
  for insert to authenticated with check (vehicle_id in (select app.my_writable_vehicle_ids()));
create policy reminder_rules_update on public.reminder_rules
  for update to authenticated
  using (vehicle_id in (select app.my_writable_vehicle_ids()))
  with check (vehicle_id in (select app.my_writable_vehicle_ids()));
create policy reminder_rules_delete on public.reminder_rules
  for delete to authenticated using (vehicle_id in (select app.my_writable_vehicle_ids()));

create policy issues_select on public.issues
  for select to authenticated using (vehicle_id in (select app.my_vehicle_ids()));
create policy issues_insert on public.issues
  for insert to authenticated with check (vehicle_id in (select app.my_writable_vehicle_ids()));
create policy issues_update on public.issues
  for update to authenticated
  using (vehicle_id in (select app.my_writable_vehicle_ids()))
  with check (vehicle_id in (select app.my_writable_vehicle_ids()));
create policy issues_delete on public.issues
  for delete to authenticated using (vehicle_id in (select app.my_writable_vehicle_ids()));

create policy notes_select on public.notes
  for select to authenticated using (vehicle_id in (select app.my_vehicle_ids()));
create policy notes_insert on public.notes
  for insert to authenticated with check (vehicle_id in (select app.my_writable_vehicle_ids()));
create policy notes_update on public.notes
  for update to authenticated
  using (vehicle_id in (select app.my_writable_vehicle_ids()))
  with check (vehicle_id in (select app.my_writable_vehicle_ids()));
create policy notes_delete on public.notes
  for delete to authenticated using (vehicle_id in (select app.my_writable_vehicle_ids()));

create policy mileage_logs_select on public.mileage_logs
  for select to authenticated using (vehicle_id in (select app.my_vehicle_ids()));
create policy mileage_logs_insert on public.mileage_logs
  for insert to authenticated with check (vehicle_id in (select app.my_writable_vehicle_ids()));
create policy mileage_logs_update on public.mileage_logs
  for update to authenticated
  using (vehicle_id in (select app.my_writable_vehicle_ids()))
  with check (vehicle_id in (select app.my_writable_vehicle_ids()));
create policy mileage_logs_delete on public.mileage_logs
  for delete to authenticated using (vehicle_id in (select app.my_writable_vehicle_ids()));

-- Settings --------------------------------------------------------------------

create policy user_settings_all on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
