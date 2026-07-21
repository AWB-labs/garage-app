/**
 * Checks the Supabase backend the way the app uses it: real accounts, real
 * JWTs, PostgREST over HTTPS, and the same supabase-js query builders that
 * ship in src/sync. Nothing uses the service role except creating and deleting
 * the throwaway test accounts, because the point is to prove row level
 * security holds for ordinary callers.
 *
 * Run it after any change to supabase/migrations or src/sync:
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_ANON_KEY=<anon> \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role> \
 *   node scripts/verify-backend.mjs
 *
 * The variables are deliberately not named EXPO_PUBLIC_*. That prefix is what
 * makes Expo inline a value into the bundle, and the service role key bypasses
 * every policy in this repo. It must never reach a phone.
 *
 * It creates accounts named garage.<who>.<stamp>@example.com and removes them
 * and their data at the end, including on failure.
 */
import { createClient } from '@supabase/supabase-js';

const SBURL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SBURL || !ANON || !SVC) {
  console.error(
    'Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. See the header of this file.'
  );
  process.exit(2);
}

const PW = 'garage-verify-pw-9182';
const stamp = Date.now().toString(36);
const mail = (who) => `garage.${who}.${stamp}@example.com`;
const id = (n) => `verify-${stamp}-${n}`;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

const adminHeaders = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

async function createUser(email) {
  const res = await fetch(`${SBURL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email, password: PW, email_confirm: true }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`create ${email}: ${JSON.stringify(body)}`);
  return body.id;
}

async function deleteUser(userId) {
  const res = await fetch(`${SBURL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  return { ok: res.ok, status: res.status, body: res.ok ? '' : await res.text() };
}

async function signedInClient(email) {
  const client = createClient(SBURL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

const carId = id('car');
const svcId = id('svc');
const svc2Id = id('svc2');
const issueId = id('issue');

const accounts = [];

try {
  console.log('\n== Accounts ==');
  const aliceId = await createUser(mail('alice'));
  const bobId = await createUser(mail('bob'));
  const carolId = await createUser(mail('carol'));
  accounts.push(aliceId, bobId, carolId);
  const A = await signedInClient(mail('alice'));
  const B = await signedInClient(mail('bob'));
  const C = await signedInClient(mail('carol'));
  check('three accounts sign in', true);

  const profile = await A.from('profiles').select('id, email').eq('id', aliceId);
  check(
    'the signup trigger mirrors the user into profiles',
    !profile.error && profile.data.length === 1 && profile.data[0].email === mail('alice'),
    profile.error?.message
  );

  console.log('\n== Alice owns a car ==');
  // The exact call src/sync/engine.ts makes for a car this account owns.
  const carUpsert = await A.from('vehicles').upsert(
    {
      id: carId,
      owner_id: aliceId,
      make: 'BMW',
      model: '330i',
      year: 2021,
      nickname: 'The Daily',
      plate: 'STR 5301',
      vin: null,
      current_mileage: 62400,
      created_at: new Date().toISOString(),
      deleted_at: null,
    },
    { onConflict: 'id' }
  );
  check('vehicle upsert as owner', !carUpsert.error, carUpsert.error?.message);

  // Regression guard: RETURNING makes Postgres check the SELECT policy against
  // the new row, before the AFTER INSERT trigger has granted visibility.
  const withReturning = await A.from('vehicles')
    .insert({
      id: id('car2'),
      owner_id: aliceId,
      make: 'Mazda',
      model: '323',
      year: 1999,
      current_mileage: 10,
      created_at: new Date().toISOString(),
    })
    .select();
  check('inserting a car with RETURNING works', !withReturning.error, withReturning.error?.message);

  const members = await A.from('vehicle_members').select('user_id, role').eq('vehicle_id', carId);
  check(
    'the trigger makes the inserter the owner',
    !members.error && members.data.length === 1 && members.data[0].role === 'owner',
    JSON.stringify(members.data)
  );

  const service = await A.from('service_records').upsert(
    {
      id: svcId,
      vehicle_id: carId,
      type: 'oil',
      custom_label: null,
      date: new Date().toISOString(),
      mileage: 62000,
      cost: 2400.5,
      shop: 'Bavarian Auto Group',
      notes: 'LiquiMoly 5W-30',
      deleted_at: null,
    },
    { onConflict: 'id' }
  );
  check('service upsert', !service.error, service.error?.message);
  const cost = await A.from('service_records').select('cost').eq('id', svcId);
  check('cost survives the round trip as a number', cost.data?.[0]?.cost === 2400.5);

  console.log('\n== A stranger sees nothing ==');
  const carolCars = await C.from('vehicles').select('id');
  check('carol sees zero cars', !carolCars.error && carolCars.data.length === 0);
  const carolServices = await C.from('service_records').select('id');
  check('carol sees zero service records', !carolServices.error && carolServices.data.length === 0);
  const carolWrite = await C.from('service_records').insert({
    id: id('steal'),
    vehicle_id: carId,
    type: 'oil',
    date: new Date().toISOString(),
    mileage: 1,
  });
  check('carol cannot write to a car she cannot see', !!carolWrite.error);
  const carolProfile = await C.from('profiles').select('email').eq('id', aliceId);
  check('carol cannot read a stranger profile', carolProfile.data?.length === 0);

  console.log('\n== Sharing ==');
  const invite = await A.rpc('invite_to_vehicle', {
    p_vehicle_id: carId,
    p_email: mail('bob'),
    p_role: 'editor',
  });
  check(
    'sharing with an existing account grants access at once',
    !invite.error && invite.data?.status === 'added',
    invite.error?.message ?? JSON.stringify(invite.data)
  );

  const bobCars = await B.from('vehicles').select('id');
  check('bob sees the car', !bobCars.error && bobCars.data.some((v) => v.id === carId));
  const bobProfile = await B.from('profiles').select('email').eq('id', aliceId);
  check('bob can read the profile of someone he shares a car with', bobProfile.data?.length === 1);

  // The member list embed. vehicle_members points at profiles twice, through
  // user_id and invited_by, so the constraint has to be named or PostgREST
  // rejects the whole query as ambiguous.
  const memberList = await A.from('vehicle_members')
    .select('user_id, role, profiles!vehicle_members_user_id_fkey(email, display_name)')
    .eq('vehicle_id', carId);
  check('the member list embed resolves', !memberList.error, memberList.error?.message);
  check(
    'every member row carries its profile email',
    memberList.data?.length === 2 && memberList.data.every((m) => m.profiles?.email),
    JSON.stringify(memberList.data)
  );

  const bobWrite = await B.from('service_records').upsert(
    {
      id: svc2Id,
      vehicle_id: carId,
      type: 'tires',
      date: new Date().toISOString(),
      mileage: 62500,
      cost: 11200,
      deleted_at: null,
    },
    { onConflict: 'id' }
  );
  check('an editor can log a service', !bobWrite.error, bobWrite.error?.message);

  // An editor updating a car sends no owner_id, which is the path in engine.ts.
  const editorUpdate = await B.from('vehicles')
    .update({ make: 'BMW', model: '330i', year: 2021, nickname: 'Bob renamed it', current_mileage: 62500 })
    .eq('id', carId);
  check('an editor can update a car without sending owner_id', !editorUpdate.error, editorUpdate.error?.message);

  console.log('\n== What an editor may not do ==');
  // PostgREST answers 204 when a PATCH matches zero rows, so every negative
  // below reads the state back as the owner rather than trusting the status.
  await B.rpc('invite_to_vehicle', { p_vehicle_id: carId, p_email: mail('carol'), p_role: 'viewer' });
  const shared = await A.from('vehicle_members').select('user_id').eq('vehicle_id', carId);
  check('an editor cannot re-share the car', shared.data?.length === 2, JSON.stringify(shared.data));

  await B.from('vehicles').update({ deleted_at: new Date().toISOString() }).eq('id', carId);
  const tomb = await A.from('vehicles').select('deleted_at').eq('id', carId);
  check('an editor cannot delete the car by tombstoning it', tomb.data?.[0]?.deleted_at === null);

  await B.from('vehicles').update({ owner_id: bobId }).eq('id', carId);
  const owner = await A.from('vehicles').select('owner_id').eq('id', carId);
  check('an editor cannot take ownership', owner.data?.[0]?.owner_id === aliceId);

  await B.from('vehicle_members').update({ role: 'owner' }).eq('vehicle_id', carId).eq('user_id', bobId);
  const bobRole = await A.from('vehicle_members')
    .select('role')
    .eq('vehicle_id', carId)
    .eq('user_id', bobId);
  check('an editor cannot promote himself', bobRole.data?.[0]?.role === 'editor');

  console.log('\n== Viewer ==');
  const demote = await A.from('vehicle_members')
    .update({ role: 'viewer' })
    .eq('vehicle_id', carId)
    .eq('user_id', bobId);
  check('the owner can demote to viewer', !demote.error, demote.error?.message);
  const viewerWrite = await B.from('service_records').insert({
    id: id('svc3'),
    vehicle_id: carId,
    type: 'brakes',
    date: new Date().toISOString(),
    mileage: 62600,
  });
  check('a viewer cannot log a service', !!viewerWrite.error);
  const viewerRead = await B.from('service_records').select('id').eq('vehicle_id', carId);
  check('a viewer can still read', viewerRead.data?.length === 2, JSON.stringify(viewerRead.data));

  console.log('\n== Inviting an email with no account ==');
  const parked = await A.rpc('invite_to_vehicle', {
    p_vehicle_id: carId,
    p_email: mail('dave'),
    p_role: 'editor',
  });
  check('an unknown email parks an invitation', parked.data?.status === 'invited', JSON.stringify(parked.data));

  const daveId = await createUser(mail('dave'));
  accounts.push(daveId);
  const D = await signedInClient(mail('dave'));
  const daveBefore = await D.from('vehicles').select('id');
  check('dave sees nothing before claiming', daveBefore.data?.length === 0);
  const claimed = await D.rpc('claim_pending_invites');
  check('dave claims exactly one invitation', claimed.data === 1, JSON.stringify(claimed.data));
  const daveAfter = await D.from('vehicles').select('id');
  check('dave sees the car after claiming', daveAfter.data?.length === 1);
  const leftover = await A.from('vehicle_invites').select('id').eq('vehicle_id', carId);
  check('the invitation row is consumed', leftover.data?.length === 0);

  console.log('\n== Removal and leaving ==');
  const removed = await A.from('vehicle_members').delete().eq('vehicle_id', carId).eq('user_id', bobId);
  check('the owner can remove somebody', !removed.error, removed.error?.message);
  const bobAfter = await B.from('vehicles').select('id').eq('id', carId);
  check('the removed person loses the car', bobAfter.data?.length === 0);

  const left = await D.from('vehicle_members').delete().eq('vehicle_id', carId).eq('user_id', daveId);
  check('somebody can leave on their own', !left.error, left.error?.message);

  await A.from('vehicle_members').delete().eq('vehicle_id', carId).eq('user_id', aliceId);
  const stillOwned = await A.from('vehicle_members').select('role').eq('vehicle_id', carId);
  check(
    'the owner row cannot be deleted, so a car is never orphaned',
    stillOwned.data?.length === 1 && stillOwned.data[0].role === 'owner',
    JSON.stringify(stillOwned.data)
  );

  console.log('\n== Deletes ==');
  await A.from('issues').upsert(
    {
      id: issueId,
      vehicle_id: carId,
      title: 'Grinding when braking',
      description: 'Metal on metal at low speed.',
      severity: 'critical',
      status: 'fixed',
      created_at: new Date().toISOString(),
      resolved_by_service_id: svc2Id,
      deleted_at: null,
    },
    { onConflict: 'id' }
  );
  await A.from('service_records').update({ deleted_at: new Date().toISOString() }).eq('id', svc2Id);
  const unlinked = await A.from('issues').select('resolved_by_service_id').eq('id', issueId);
  check(
    'deleting a service unlinks the issue that pointed at it',
    unlinked.data?.[0]?.resolved_by_service_id === null,
    JSON.stringify(unlinked.data)
  );

  const tombstoned = await A.from('service_records').select('id, deleted_at').eq('id', svc2Id);
  check(
    'a tombstoned row still reads, so other devices learn of the delete',
    tombstoned.data?.[0]?.deleted_at != null
  );

  const ownerDelete = await A.from('vehicles').update({ deleted_at: new Date().toISOString() }).eq('id', carId);
  check('the owner can tombstone the car', !ownerDelete.error, ownerDelete.error?.message);

  console.log('\n== Sync mechanics ==');
  const before = await A.from('vehicles').select('updated_at').eq('id', carId);
  await A.from('vehicles').update({ nickname: 'Renamed' }).eq('id', carId);
  const after = await A.from('vehicles').select('updated_at').eq('id', carId);
  check(
    'updated_at moves on every write, which is what the pull cursor rides',
    new Date(after.data[0].updated_at) > new Date(before.data[0].updated_at)
  );
  const cursor = await A.from('vehicles')
    .select('id')
    .gt('updated_at', before.data[0].updated_at)
    .order('updated_at', { ascending: true })
    .range(0, 499);
  check('a cursor query returns the changed row', cursor.data?.length === 1, JSON.stringify(cursor.data));

  console.log('\n== Settings ==');
  const settings = await A.from('user_settings').upsert(
    { user_id: aliceId, theme: 'dark', unit: 'km', currency: 'EGP', car_image_key: '' },
    { onConflict: 'user_id' }
  );
  check('settings upsert', !settings.error, settings.error?.message);
  const settingsRead = await A.from('user_settings').select('*').eq('user_id', aliceId).limit(1);
  check('settings pull', settingsRead.data?.[0]?.theme === 'dark');
  const otherSettings = await C.from('user_settings').select('user_id');
  check('settings are invisible to another account', otherSettings.data?.length === 0);
  const forged = await C.from('user_settings').insert({ user_id: aliceId, theme: 'light' });
  check('settings cannot be forged onto another account', !!forged.error);

  console.log('\n== Input validation ==');
  const badRole = await A.rpc('invite_to_vehicle', {
    p_vehicle_id: carId,
    p_email: mail('carol'),
    p_role: 'owner',
  });
  check('the invite rpc rejects the owner role', !!badRole.error);
  const badEmail = await A.rpc('invite_to_vehicle', {
    p_vehicle_id: carId,
    p_email: 'not-an-email',
    p_role: 'editor',
  });
  check('the invite rpc rejects a malformed email', !!badEmail.error);
  const self = await A.rpc('invite_to_vehicle', {
    p_vehicle_id: carId,
    p_email: mail('alice'),
    p_role: 'editor',
  });
  check('the invite rpc rejects sharing with yourself', !!self.error);

  const anon = createClient(SBURL, ANON, { auth: { persistSession: false } });
  const anonRead = await anon.from('vehicles').select('id');
  check('a signed out caller reads nothing', !!anonRead.error || anonRead.data?.length === 0);
} catch (error) {
  fail++;
  failures.push(`threw: ${error.message}`);
  console.log('\nTHREW:', error.message);
} finally {
  // Deleting the accounts is itself a test. Alice owns a car with service
  // records and an issue, so this fires the whole cascade and every trigger
  // hanging off it. That path once failed with "Database error deleting user",
  // leaving accounts nothing could remove.
  console.log('\n== Account deletion ==');
  const results = [];
  for (const account of accounts) results.push(await deleteUser(account));
  const stuck = results.filter((r) => !r.ok);
  check(
    'every account deletes, cascade and triggers included',
    stuck.length === 0,
    stuck.map((r) => `${r.status} ${r.body}`).join(' | ')
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) console.log('Failed:\n  ' + failures.join('\n  '));
process.exit(fail === 0 ? 0 : 1);
