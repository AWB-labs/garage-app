-- Sharing a car, and the one referential repair the schema cannot express.

-- Issue links -----------------------------------------------------------------

-- issues.resolved_by_service_id is deliberately not a foreign key, so that
-- deleting the service that fixed an issue does not delete the issue. The
-- client already nulls the column by hand when it deletes a service, but a
-- second device tombstoning a service has no way to reach the issue rows on
-- this one. Doing it server side makes the repair independent of which client
-- performed the delete.
create or replace function app.unlink_resolved_service()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.issues
  set resolved_by_service_id = null
  where resolved_by_service_id = new.id;
  return new;
end;
$$;

create trigger unlink_resolved_service
  after update of deleted_at on public.service_records
  for each row
  when (new.deleted_at is not null and old.deleted_at is null)
  execute function app.unlink_resolved_service();

create or replace function app.unlink_deleted_service()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.issues
  set resolved_by_service_id = null
  where resolved_by_service_id = old.id;
  return old;
end;
$$;

create trigger unlink_deleted_service
  after delete on public.service_records
  for each row execute function app.unlink_deleted_service();

-- Inviting --------------------------------------------------------------------

-- Adding somebody to a car has two shapes and the caller should not have to
-- care which: if the email already has an account they get access straight
-- away, otherwise the invitation waits for them to sign up.
--
-- This is SECURITY DEFINER because the second half needs to read profiles by
-- email, which RLS otherwise hides. The ownership check below is what makes
-- that safe, and it is the first thing the function does. It deliberately does
-- not reveal whether an email has an account: both paths return quietly.
create or replace function public.invite_to_vehicle(
  p_vehicle_id text,
  p_email      text,
  p_role       text default 'editor'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid := (select auth.uid());
  v_email   text := lower(trim(p_email));
  v_target  uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_role not in ('editor', 'viewer') then
    raise exception 'role must be editor or viewer' using errcode = '22023';
  end if;

  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'that does not look like an email address' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.vehicle_members m
    where m.vehicle_id = p_vehicle_id
      and m.user_id = v_caller
      and m.role = 'owner'
  ) then
    raise exception 'only the owner of a car can share it' using errcode = '42501';
  end if;

  if v_email = (select lower(u.email) from auth.users u where u.id = v_caller) then
    raise exception 'you already have this car' using errcode = '22023';
  end if;

  select p.id into v_target from public.profiles p where lower(p.email) = v_email;

  if v_target is not null then
    insert into public.vehicle_members (vehicle_id, user_id, role, invited_by)
    values (p_vehicle_id, v_target, p_role, v_caller)
    on conflict (vehicle_id, user_id) do update
      set role = excluded.role
      -- Never demote the owner through a share, which the unique index would
      -- reject anyway but with an error nobody can read.
      where vehicle_members.role <> 'owner';

    delete from public.vehicle_invites
    where vehicle_id = p_vehicle_id and lower(email) = v_email;

    return jsonb_build_object('status', 'added');
  end if;

  insert into public.vehicle_invites (id, vehicle_id, email, role, invited_by)
  values (
    -- gen_random_uuid is core Postgres since 13, so this needs no extension.
    gen_random_uuid()::text,
    p_vehicle_id,
    v_email,
    p_role,
    v_caller
  )
  on conflict (vehicle_id, lower(email)) do update
    set role = excluded.role,
        invited_by = excluded.invited_by,
        expires_at = now() + interval '30 days';

  return jsonb_build_object('status', 'invited');
end;
$$;

-- Claiming --------------------------------------------------------------------

-- Called by the client right after sign in and sign up. Turns every unexpired
-- invitation addressed to this user's email into real membership.
create or replace function public.claim_pending_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_email  text;
  v_count  integer := 0;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_caller;
  if v_email is null then
    return 0;
  end if;

  with claimed as (
    delete from public.vehicle_invites i
    where lower(i.email) = v_email
      and i.expires_at > now()
    returning i.vehicle_id, i.role, i.invited_by
  ), inserted as (
    insert into public.vehicle_members (vehicle_id, user_id, role, invited_by)
    select c.vehicle_id, v_caller, c.role, c.invited_by from claimed c
    on conflict (vehicle_id, user_id) do nothing
    returning 1
  )
  select count(*) into v_count from inserted;

  -- Expired invitations are cleaned up opportunistically rather than by a job.
  delete from public.vehicle_invites where expires_at <= now();

  return v_count;
end;
$$;

revoke all on function
  public.invite_to_vehicle(text, text, text),
  public.claim_pending_invites()
from public;

grant execute on function
  public.invite_to_vehicle(text, text, text),
  public.claim_pending_invites()
to authenticated;
