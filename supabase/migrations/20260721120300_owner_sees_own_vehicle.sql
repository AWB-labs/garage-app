-- An owner can always see their own car, without waiting for the membership
-- row that normally grants that.
--
-- Found by inserting a car as a real signed in user. `INSERT ... RETURNING`
-- makes Postgres check the SELECT policy against the new row, and the row that
-- makes a car visible, its owner membership, is written by an AFTER INSERT
-- trigger that has not fired yet at that point. So this failed:
--
--   insert into vehicles (...) values (...) returning id
--   ERROR: new row violates row-level security policy for table "vehicles"
--
-- while the same insert without RETURNING succeeded. The client happens to
-- send Prefer: return=minimal today, which is why the app did not trip over
-- it, but that is luck: adding .select() to the upsert in src/sync/engine.ts
-- would have broken car creation with an error pointing at the wrong thing.
--
-- Checking owner_id directly closes the window. It grants nothing new, since
-- an owner always ends up with a membership row a moment later anyway.
--
-- The trigger cannot simply move to BEFORE INSERT instead: vehicle_members has
-- a foreign key to vehicles, so the car has to exist first.

drop policy vehicles_select on public.vehicles;

create policy vehicles_select on public.vehicles
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or id in (select app.my_vehicle_ids())
  );
