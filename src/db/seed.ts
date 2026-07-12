import { subDays } from 'date-fns';

import { newId } from '@/lib/id';
import type { Issue, MileageLog, Note, ReminderRule, ServiceRecord, Vehicle } from '@/lib/types';
import * as dao from './dao';

/**
 * Seeds one realistic car with ~18 mixed events so the app looks alive on
 * first launch. Runs only when the garage is empty and never after.
 */
export async function seedIfEmpty(): Promise<void> {
  const vehicles = await dao.listVehicles();
  if (vehicles.length > 0) return;
  const seeded = await dao.getMeta('seeded');
  if (seeded === 'true') return;

  const now = new Date();
  const iso = (daysAgo: number) => subDays(now, daysAgo).toISOString();

  const car: Vehicle = {
    id: newId(),
    make: 'BMW',
    model: '330i',
    year: 2021,
    nickname: 'The Daily',
    photoUri: null,
    plate: 'STR 5301',
    vin: null,
    currentMileage: 62400,
    createdAt: iso(560),
  };
  await dao.insertVehicle(car);

  const oil1: ServiceRecord = {
    id: newId(),
    vehicleId: car.id,
    type: 'oil',
    customLabel: null,
    date: iso(540),
    mileage: 38200,
    cost: 2400,
    shop: 'Bavarian Auto Group',
    notes: 'LiquiMoly 5W-30, oil filter included.',
    photoUris: [],
  };
  const filters: ServiceRecord = {
    id: newId(),
    vehicleId: car.id,
    type: 'filters',
    customLabel: null,
    date: iso(400),
    mileage: 45000,
    cost: 1150,
    shop: 'Bavarian Auto Group',
    notes: 'Cabin and engine air filters.',
    photoUris: [],
  };
  const brakes: ServiceRecord = {
    id: newId(),
    vehicleId: car.id,
    type: 'brakes',
    customLabel: null,
    date: iso(260),
    mileage: 52300,
    cost: 8500,
    shop: 'Auto Mac, Abbas El Akkad',
    notes: 'Front pads and discs, Textar. Grinding gone.',
    photoUris: [],
  };
  const oil2: ServiceRecord = {
    id: newId(),
    vehicleId: car.id,
    type: 'oil',
    customLabel: null,
    date: iso(170),
    mileage: 55600,
    cost: 2600,
    shop: 'Bavarian Auto Group',
    notes: null,
    photoUris: [],
  };
  const tires: ServiceRecord = {
    id: newId(),
    vehicleId: car.id,
    type: 'tires',
    customLabel: null,
    date: iso(90),
    mileage: 59400,
    cost: 11200,
    shop: 'El Gabry Tires, Nasr City',
    notes: 'Two new Michelin PS4 up front, balanced and aligned.',
    photoUris: [],
  };
  for (const s of [oil1, filters, brakes, oil2, tires]) await dao.insertService(s);

  const grinding: Issue = {
    id: newId(),
    vehicleId: car.id,
    title: 'Grinding when braking',
    description: 'Metal-on-metal sound from the front at low speed. Started after the Sokhna trip.',
    severity: 'critical',
    status: 'fixed',
    photoUris: [],
    createdAt: iso(285),
    resolvedByServiceId: brakes.id,
    resolvedAt: iso(260),
  };
  const tireLeak: Issue = {
    id: newId(),
    vehicleId: car.id,
    title: 'Slow leak in rear right tire',
    description: 'Loses about 0.3 bar a week. Plugged once already, keeping an eye on it.',
    severity: 'medium',
    status: 'monitoring',
    photoUris: [],
    createdAt: iso(40),
    resolvedByServiceId: null,
    resolvedAt: null,
  };
  const acWarm: Issue = {
    id: newId(),
    vehicleId: car.id,
    title: 'AC blows warm at idle',
    description: 'Cooling is fine while moving, goes warm at long lights. Compressor clutch maybe.',
    severity: 'medium',
    status: 'open',
    photoUris: [],
    createdAt: iso(12),
    resolvedByServiceId: null,
    resolvedAt: null,
  };
  for (const i of [grinding, tireLeak, acWarm]) await dao.insertIssue(i);

  const notes: Note[] = [
    {
      id: newId(),
      vehicleId: car.id,
      body: 'Insurance renews 15 Nov. Broker: Ahmed 0100 442 8811. Policy copy in the glovebox.',
      pinned: true,
      createdAt: iso(200),
      updatedAt: iso(200),
    },
    {
      id: newId(),
      vehicleId: car.id,
      body: 'Citystars parking card is behind the sun visor.',
      pinned: false,
      createdAt: iso(150),
      updatedAt: iso(150),
    },
    {
      id: newId(),
      vehicleId: car.id,
      body: 'Fuel: 95 octane only. The 92 at the Mostorod station made it knock on the ring road.',
      pinned: false,
      createdAt: iso(75),
      updatedAt: iso(75),
    },
    {
      id: newId(),
      vehicleId: car.id,
      body: 'Wheel bolts torque to 120 Nm. Locking key lives in the trunk side pocket.',
      pinned: false,
      createdAt: iso(30),
      updatedAt: iso(30),
    },
  ];
  for (const n of notes) await dao.insertNote(n);

  const logs: MileageLog[] = [
    { id: newId(), vehicleId: car.id, mileage: 41000, date: iso(480) },
    { id: newId(), vehicleId: car.id, mileage: 50200, date: iso(300) },
    { id: newId(), vehicleId: car.id, mileage: 55600, date: iso(170) },
    { id: newId(), vehicleId: car.id, mileage: 59400, date: iso(90) },
    { id: newId(), vehicleId: car.id, mileage: 61800, date: iso(14) },
    { id: newId(), vehicleId: car.id, mileage: 62400, date: iso(2) },
  ];
  for (const m of logs) await dao.insertMileageLog(m);

  const reminders: ReminderRule[] = [
    {
      id: newId(),
      vehicleId: car.id,
      serviceType: 'oil',
      customLabel: null,
      mileageInterval: 10000,
      timeIntervalDays: 180,
      lastDoneMileage: oil2.mileage,
      lastDoneDate: oil2.date,
    },
    {
      id: newId(),
      vehicleId: car.id,
      serviceType: 'inspection',
      customLabel: null,
      mileageInterval: null,
      timeIntervalDays: 365,
      lastDoneMileage: null,
      lastDoneDate: iso(400),
    },
    {
      id: newId(),
      vehicleId: car.id,
      serviceType: 'tires',
      customLabel: null,
      mileageInterval: 40000,
      timeIntervalDays: null,
      lastDoneMileage: tires.mileage,
      lastDoneDate: tires.date,
    },
    {
      id: newId(),
      vehicleId: car.id,
      serviceType: 'battery',
      customLabel: null,
      mileageInterval: null,
      timeIntervalDays: 730,
      lastDoneMileage: null,
      lastDoneDate: iso(600),
    },
    {
      id: newId(),
      vehicleId: car.id,
      serviceType: 'custom',
      customLabel: 'Brake fluid',
      mileageInterval: null,
      timeIntervalDays: 730,
      lastDoneMileage: brakes.mileage,
      lastDoneDate: brakes.date,
    },
  ];
  for (const r of reminders) await dao.insertReminder(r);

  await dao.setMeta('seeded', 'true');
  await dao.setMeta('activeVehicleId', car.id);
}
