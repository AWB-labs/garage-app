-- Deleting an account has to survive the cascade it sets off.
--
-- Found by deleting a real user through the Auth admin API, which answered
-- "Database error deleting user" for exactly those accounts that owned a car
-- with service records, and succeeded for everybody else.
--
-- The chain is: auth.users -> profiles -> vehicles -> service_records, all by
-- cascade. Cascades themselves are fine, because referential actions run as
-- the table owner. The AFTER DELETE trigger they fire does not: an ordinary
-- trigger function runs as the *current* user, and the current user here is
-- supabase_auth_admin, the role GoTrue connects as. That role has no rights on
-- public.issues, so unlink_deleted_service died and took the whole delete with
-- it, leaving an account that could not be removed by any means short of SQL.
--
-- SECURITY DEFINER makes both unlink triggers run as the owner instead. It
-- grants nothing a caller did not already have: the functions only ever null a
-- column on issues that pointed at a service row which has just been removed,
-- and reaching either trigger at all requires permission to delete or tombstone
-- that service in the first place.
--
-- The alternative, granting supabase_auth_admin write access to public.issues,
-- would push an auth role into application tables to paper over a trigger
-- problem. Not worth it.

create or replace function app.unlink_resolved_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.issues
  set resolved_by_service_id = null
  where resolved_by_service_id = new.id;
  return new;
end;
$$;

create or replace function app.unlink_deleted_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.issues
  set resolved_by_service_id = null
  where resolved_by_service_id = old.id;
  return old;
end;
$$;

-- Undoes a grant made by hand while chasing the above. It was not the cause and
-- is not needed: the signup trigger already runs as its definer. Removing it
-- keeps the database exactly reproducible from this migration set.
revoke usage on schema app from supabase_auth_admin;
