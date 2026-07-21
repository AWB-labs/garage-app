# Garage: notes for the next agent

A local-first car maintenance app. Read this before touching anything: most of it is knowledge that cost real debugging, and several items are traps you will fall into again if you do the obvious thing.

Three other docs matter:
- **DESIGN.md** is the design contract (tokens, motion policy with the reduce-motion fallback table, icon grammar, vocabulary, and the locked implementation of each signature moment). It is the source of truth. If you change a signature moment, update it there too.
- **README.md** is the user-facing setup and architecture map.
- **SUPABASE.md** is the backend: how to apply the migrations, the access model, and the schema rules that are load bearing.

## Verify like this

```bash
npx tsc --noEmit                     # strict, must be zero
npx expo export --platform ios       # proves the whole Metro graph, catches what tsc cannot
npx expo-doctor                      # 18/18
```

If you touched `supabase/migrations/` or `src/sync/`, also run the backend suite. It creates throwaway accounts, exercises every policy and both roles against the real database, and deletes them again:

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run verify:backend
```

48 checks, all must pass. It caught two bugs that `tsc` and a bundle export both waved through, and the regression guards for those are still in it. Never put the service role key in `.env`: the `EXPO_PUBLIC_` prefix is what inlines a value into the bundle, and that key bypasses every policy in the repo.

A bundle export proves the graph resolves. It does **not** exercise native modules, gestures, or animation, so anything you change in those areas is unverified until it runs on a device. Say so plainly rather than claiming it works.

## Stack constraints (do not drift)

- **Expo SDK 54, pinned on purpose.** Expo Go supports exactly one SDK at a time and the user's store build is on 54. The project was originally scaffolded on 57 and had to be migrated back. **Do not bump the SDK** unless the user confirms their Expo Go moved too.
- Install native-backed packages **only** with `npx expo install`, never `npm install <pkg>@latest`. Expo Go ships fixed native binaries; a newer JS package than the baked-in native code crashes or silently misbehaves.
- SDK 54 gives us Reanimated 4, FlashList v2, Skia 2, and gesture-handler 2.28. Every signature moment depends on that set.
- **expo-router is v6 here, not v7.** `Tabs` comes from `expo-router` and `BottomTabBarProps` from `@react-navigation/bottom-tabs` (the `expo-router/js-tabs` subpath is v7-only). `useIsFocused` is **not** re-exported by the router: import it from `@react-navigation/native`.
- `expo-image` and `expo-sharing` ship **no config plugin** at SDK 54. Listing them in `app.json` plugins is a hard startup error. The libraries themselves work fine.
- No custom native code, ever. It must keep running in Expo Go.

## Architecture

SQLite is the source of truth. Zustand hydrates **once** behind the splash (`_layout.tsx` holds the native splash until fonts and data are ready), then every mutation writes through the DAO and mirrors in memory. **Components never touch the database**, and never query in `renderItem`.

Supabase sits *behind* that, never in front of it. Screens never await the network: they read SQLite, and the sync engine reconciles in the background. Adding a `supabase.from(...)` call to a screen is the one change that would undo the whole design.

```
src/theme/       tokens, motion policy, haptics. NOTHING outside this folder hardcodes a color, size, radius, spring, or duration.
src/db/          schema (WAL, user_version migrations), DAOs, seed, outbox
src/stores/      garage (all entities + mutations), settings, auth, sheets (open a sheet by kind)
src/sync/        engine (push/pull/reconcile), mapping (camelCase <-> snake_case), sharing, nudge
src/lib/         derived logic: reminder urgency, health score, timeline merge, stats, formatting, car imagery, supabase client
src/components/ui/         primitives, incl. the bespoke Icon set (no icon libraries, ever)
src/components/signature/  the hero moments
src/components/sheets/     gesture sheets + SheetHost
src/app/                   expo-router routes
supabase/migrations/       Postgres schema and RLS. See SUPABASE.md.
```

## The backend is optional, and that is a feature

With no `EXPO_PUBLIC_SUPABASE_*` in the environment, `isSupabaseConfigured` is false and Garage is exactly the app it always was: local only, no sign in screen, no sync, demo car seeded. Every backend entry point checks this. When you add a feature that touches the network, check it too, and make the offline path the one that works.

## Sync

One cycle, in `src/sync/engine.ts`: claim invitations, pull membership, reconcile, push the outbox, pull each table, reload the stores from SQLite.

- **Conflict resolution is "a pending local write wins".** Push runs before pull, and a row still in the outbox when the pull lands is skipped. Between devices, later write wins.
- **The outbox holds one entry per row, not a log.** Repeated edits collapse onto the queued entry and keep its sequence number. Push order is table first, sequence second, so a car always reaches the server before the services pointing at it.
- **Applying a pulled row goes through the same DAO functions a user edit does**, so it is wrapped in `withRemoteApply` to suppress queueing. Without that, every pull immediately re-queues everything it just received.
- **The pull cursor re-reads a minute of history.** `updated_at` is stamped at statement time and rows become visible at commit time, so a strict cursor can step over a slow transaction forever. Applying is idempotent, so the overlap is free.
- **`synced_vehicles` is how a revoked share is told apart from an offline creation.** A car in that table that the membership pull no longer returns has been taken away and leaves the phone. A car that was never in it has simply not been pushed yet.

## Traps (each one already bit us)

**Route params.** The `[id]` segment belongs to the parent `car/[id]` route. A tab screen does **not** automatically see it when navigated to programmatically. Every section screen resolves its car through `useRouteVehicle()` (`src/lib/useRouteVehicle.ts`), which falls back to the store's active car. Use that hook; going back to raw `useLocalSearchParams` in a tab screen makes the screen render blank the moment the param is dropped. That is exactly why every section except the dashboard was once empty.

**FlashList v2 recycling.** Cells are keyed by recycle-pool key, not by item id, so the same `Animated.View` instance is handed a different item as you scroll. Consequences, all learned the hard way:
- **Never put a Reanimated `layout` / `LinearTransition` on anything inside a cell.** It springs row height on every recycle, and it cannot animate a reorder anyway, because FlashList moves the cell, not your view.
- `entering` animations replay whenever a new pool key is minted (that is, mid-scroll). Every list gates them behind an entrance-window ref. Copy the pattern from `issues.tsx`.
- Any per-row shared value must reset when the cell is handed a different item (see `ReminderCard`'s `lastRuleId` guard).
- **One Skia canvas per screen region, never inside a cell.** `RewardPulse` is deliberately plain Reanimated for this reason.
- FlashList needs a height-bounded parent and does not set `flex: 1` on itself. If a list renders nothing, check that first.

**Animating layout properties.** The tab bar used to animate `flex` through a layout transition and the icons visibly shoved each other. It is now fixed-width cells with one amber tick sliding on a spring. Do not reintroduce layout animation there.

**Overlap in the FAB bloom.** Actions used to sit on a polar arc, and a long label ("Update mileage") ran under its neighbour's button. They now sit one per horizontal band, which makes overlap impossible at any label length or text size. If you restore the arc, you must actually solve the label collision, not eyeball it at one screen width.

**Reminder anchors are derived, never stamped.** `logService` / `updateService` / `deleteService` all call `reanchorReminders`, which finds the newest matching service and sets the anchor from it. Blind-stamping means back-dating an old service resets a reminder as if it were done today. A rule with **no** matching service keeps its existing anchor: three seeded rules (inspection, battery, the custom "Brake fluid") have no backing record and would be silently wiped otherwise. Custom reminders match on `customLabel`, which is why "Mark done" carries `prefillCustomLabel` into the sheet.

**Dates.** Records persist as ISO instants (UTC). Anything that buckets by month or year must format the parsed instant in **local** time (`format(new Date(s.date), 'yyyy-MM')`), never slice the UTC string. Slicing made Stats disagree with the Service log across the midnight boundary and silently drop costs out of the chart window, so the bars stopped summing to the total above them. Do not "fix" this by changing the persistence format: existing rows are instants, and `new Date('2026-01-01')` parses as UTC midnight, which reintroduces the same off-by-one from the other side.

**Haptics have exactly one owner per action.** The reward moment fires from the Service screen only when it is **focused**, and only when a service actually advanced a reminder's anchor (not when the rule was merely edited); it does not fire `haptic.save` because the sheet already did. `SegmentedControl` takes a `hapticFor` override so a caller that owns its own haptic (marking an issue Fixed is a *save*, not a *pick*) does not double-buzz. Before adding a haptic, check who else fires on that path.

**Accessibility.** A pressable `Card` is a single accessibility element in RN, so nested buttons inside it are unreachable unless the card passes `accessible={false}` (documented on the prop). Fullscreen overlays must be real modals: `Portal` takes `modal` and hides the host from assistive tech, because TalkBack has no equivalent of `accessibilityViewIsModal`.

**Sheets.** `GarageSheet` passes `animationConfigs` + `overrideReduceMotion`. Without them, bottom-sheet leaves `reduceMotion` unset and Reanimated **snaps** the sheet instantly under the OS reduce-motion flag instead of doing the short translate the motion policy specifies.

**Row ids are TEXT, everywhere, including Postgres.** `newId()` returns `"mfd3k2-a8f2x9q1"`, not a uuid, and offline-first means a row has its final id before it has ever seen a server. Migrating the primary keys to `uuid` would orphan every row already on a phone.

**Photos never sync.** They are local file paths, and the Postgres schema has no column for them at all. `upsertVehicleFromRemote` and friends deliberately preserve `photoUri` / `photoUris` on conflict rather than taking the pulled value: a pulled row that wrote its missing photo list over the local one would silently wipe every receipt image on the device.

**Deleting is a tombstone, not a DELETE.** A hard delete cannot propagate. `deleted_at` is what other devices see. The one exception is local SQLite, which does hard delete and cascades children; that is fine because the vehicle tombstone makes every device cascade its own children the same way, which is also why deleted children get no outbox entries of their own.

**RLS helper functions must stay `SECURITY DEFINER` and must keep returning `SETOF`.** The first stops the recursion you get from a `vehicle_members` policy that reads `vehicle_members`. The second lets policies read `x in (select app.f())`, which Postgres evaluates once per query instead of once per row. Do not add `FORCE ROW LEVEL SECURITY`: the triggers depend on definer functions bypassing RLS as the table owner.

**A trigger that touches a second table must be SECURITY DEFINER if a cascade can reach it.** Referential actions run as the table owner, but the ordinary triggers they fire run as whoever is holding the knife, and for account deletion that is `supabase_auth_admin`, which has no rights on our tables. This made accounts that owned a car impossible to delete. Full story in SUPABASE.md.

**`INSERT ... RETURNING` makes Postgres check the SELECT policy too.** Adding `.select()` to a `supabase-js` insert changes what RLS has to allow, which is how car creation broke once already. If you add `.select()` to a write, check the read policy covers the new row at that instant, not a moment later once triggers have run.

**Sharing is the one online-only surface.** Membership is a claim about somebody else's account, so queueing "add this stranger" for later would show access that may never be granted. `src/sync/sharing.ts` talks to Postgres directly and says so when it cannot reach it. Do not route it through the outbox.

**The demo seed does not run when a backend is configured.** A seeded BMW that syncs to every device the person owns reads as a real car. Someone upgrading from the local-only build gets the seed dropped on first sign in, which is what `meta:seedVehicleId` exists for.

## Car imagery

`src/lib/carImage.ts`. imagin.studio renders a car from make/model/year. Three modes in Settings, held in one `carImageKey` setting: `''` (drawn silhouette, fully offline), `'img'` (their **public demo key**: real renders, but **watermarked**), or the user's own key (clean). Calling the CDN with **no** key returns a car under a dust cover, which is why demo mode exists. `resolveCarImage()` is what the hero and garage cards call.

## Quality bar

This code was reviewed by an adversarial multi-agent pass: 29 findings, each independently verified by a skeptic that read library source and was instructed to refute by default. 25 were confirmed and fixed; 4 were thrown out as misreadings of Yoga and Reanimated internals. Hold that bar. Do not "fix" a bug you have not grounded in the actual code, and when you are unsure how a library behaves, read the installed source in `node_modules` rather than guessing.

Copy rules: plain, active voice, exact vocabulary from DESIGN.md section 8 (Service not Maintenance; Upcoming / Due soon / Overdue; Low / Medium / Critical; Open / Monitoring / Fixed). **No em dashes or en dashes anywhere**, including code comments: use commas, colons, periods, middots.

## Known open risks (unverified on device)

- **The sync engine has never run.** The schema and every query it makes are tested against the live database (see SUPABASE.md), but no cycle has executed end to end: not the outbox, not the cursor bookkeeping, not the reconcile pass, not the first sign in adoption. That needs a phone.
- **The route gate uses `Stack.Protected`.** It is the first-class API in expo-router 6 and reads correctly, but navigation is exactly what a bundle export does not exercise. The failure mode if it is wrong is loud (a blank screen or an immediate error), not subtle.
- **Local migration 2 adds a column with `ALTER TABLE`.** `vehicles.role` lands on existing installs through the `user_version` gate. Verified by reading, not by upgrading a real database that already had rows.
- **Sign out clears the garage from the phone** after a best effort push. If that push fails while offline, unsynced changes are gone. The confirmation says so and shows the count, but the tradeoff is deliberate: leaving the cars behind means the next person to open the app sees somebody else's garage.

- **iOS pull-to-refresh**: the native `RefreshControl` threshold may not exactly match the 88pt sweep the Skia needle is mapped to, so a refresh can start with the needle slightly short of full sweep. Wants calibration on a real phone.
- **Severity dial**: it takes the sheet's content-panning gesture via a `waitFor` relation. It typechecks and is grounded in gorhom's source, but the feel has not been driven by a finger.
- Deleting the **only** service backing a reminder leaves that rule on its now-stale anchor (accepted tradeoff: the alternative wipes the seeded rules that have no backing record).
