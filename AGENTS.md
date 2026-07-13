# Garage: notes for the next agent

A local-first car maintenance app. Read this before touching anything: most of it is knowledge that cost real debugging, and several items are traps you will fall into again if you do the obvious thing.

Two other docs matter:
- **DESIGN.md** is the design contract (tokens, motion policy with the reduce-motion fallback table, icon grammar, vocabulary, and the locked implementation of each signature moment). It is the source of truth. If you change a signature moment, update it there too.
- **README.md** is the user-facing setup and architecture map.

## Verify like this

```bash
npx tsc --noEmit                     # strict, must be zero
npx expo export --platform ios       # proves the whole Metro graph, catches what tsc cannot
npx expo-doctor                      # 18/18
```

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

```
src/theme/       tokens, motion policy, haptics. NOTHING outside this folder hardcodes a color, size, radius, spring, or duration.
src/db/          schema (WAL, user_version migrations), DAOs, seed
src/stores/      garage (all entities + mutations), settings, sheets (open a sheet by kind)
src/lib/         derived logic: reminder urgency, health score, timeline merge, stats, formatting, car imagery
src/components/ui/         primitives, incl. the bespoke Icon set (no icon libraries, ever)
src/components/signature/  the hero moments
src/components/sheets/     gesture sheets + SheetHost
src/app/                   expo-router routes
```

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

## Car imagery

`src/lib/carImage.ts`. imagin.studio renders a car from make/model/year. Three modes in Settings, held in one `carImageKey` setting: `''` (drawn silhouette, fully offline), `'img'` (their **public demo key**: real renders, but **watermarked**), or the user's own key (clean). Calling the CDN with **no** key returns a car under a dust cover, which is why demo mode exists. `resolveCarImage()` is what the hero and garage cards call.

## Quality bar

This code was reviewed by an adversarial multi-agent pass: 29 findings, each independently verified by a skeptic that read library source and was instructed to refute by default. 25 were confirmed and fixed; 4 were thrown out as misreadings of Yoga and Reanimated internals. Hold that bar. Do not "fix" a bug you have not grounded in the actual code, and when you are unsure how a library behaves, read the installed source in `node_modules` rather than guessing.

Copy rules: plain, active voice, exact vocabulary from DESIGN.md section 8 (Service not Maintenance; Upcoming / Due soon / Overdue; Low / Medium / Critical; Open / Monitoring / Fixed). **No em dashes or en dashes anywhere**, including code comments: use commas, colons, periods, middots.

## Known open risks (unverified on device)

- **iOS pull-to-refresh**: the native `RefreshControl` threshold may not exactly match the 88pt sweep the Skia needle is mapped to, so a refresh can start with the needle slightly short of full sweep. Wants calibration on a real phone.
- **Severity dial**: it takes the sheet's content-panning gesture via a `waitFor` relation. It typechecks and is grounded in gorhom's source, but the feel has not been driven by a finger.
- Deleting the **only** service backing a reminder leaves that rule on its now-stale anchor (accepted tradeoff: the alternative wipes the seeded rules that have no backing record).
