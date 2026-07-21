# Garage

A premium, local-first car maintenance companion. Dark-first automotive design: a warm-black world where the amber reads as emitted light. Everything lives on the phone, and optionally syncs to an account you can share a car from.

Track services, set reminders by distance or time, report and resolve issues, keep notes, log mileage on a rolling odometer, and read the whole car's story on one living timeline.

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (Android) or the Camera app (iOS). The app seeds itself with a demo car (a 2021 BMW 330i with 18 events) on first launch so every screen is alive immediately.

## Optional: accounts and sync

Garage works completely without a backend, and that is the default. Add Supabase credentials and it also gets accounts, sync across every phone you sign in on, and sharing a car with other people.

```bash
cp .env.example .env      # then fill in your project URL and anon key
```

Setup, the migrations, and the access model are in [SUPABASE.md](SUPABASE.md).

Local-first survives the change. SQLite stays the source of truth and every screen still reads from it, so the app works with no signal and reconciles later. What changes:

| | No credentials | With credentials |
|---|---|---|
| Sign in | none, straight into the garage | email and password |
| Demo car | seeded on first launch | never, a real account starts empty |
| Your cars | this phone only | every phone you sign in on |
| Sharing | not available | invite by email as editor or viewer |
| Photos | on this phone | on this phone, still not synced |

Sharing a car gives the other person their own view of it. The **owner** can share the car and delete it, an **editor** can log services, issues and mileage, and a **viewer** reads. Invite somebody who has no account yet and the invitation waits for them to make one.

Useful checks:

```bash
npx tsc --noEmit                     # strict typecheck
npx expo export --platform android   # full bundle verification
```

## What's inside

| Screen | The experience |
|---|---|
| Garage | Hero car cards (photo, studio render, or the drawn silhouette), expanding-card transition into the dashboard |
| Dashboard | Instrument cluster: rolling odometer with haptic settle, 240 degree health gauge with redline and spring needle, next-due strip, radial quick-action FAB |
| Timeline | Every service, issue, note, and mileage update on one odometer-tape rail drawn by a single Skia canvas that grows as you scroll |
| Service | Reminders escalating like one bulb brightening (dim amber, amber, redline), grouped history, receipt photos, phosphor reward pulse when an overdue item clears |
| Issues | Severity picked on a draggable dial with haptic detents; resolve an issue by linking or logging the service that fixed it |
| Notes | Searchable, pinnable, spring-reordering |
| Stats | One oversized spend numeral, spring-grown Skia bar chart, honest category rows |
| Settings | Theme (dark-first, light "spec sheet" mode), km/mi, currency, JSON export, optional studio car imagery key, account and sync status |
| Sharing | Per car: who can see it, their role, pending invitations. Only when a backend is configured |

### Studio car imagery (optional)

Add an [imagin.studio](https://www.imagin.studio) customer key in Settings and the Add car sheet can fetch a cinematic render from make, model, and year. The image downloads into the app's documents so the garage stays offline-first. Without a key, Garage draws its own car silhouette.

## Architecture

```
src/
  app/                      expo-router routes
    _layout.tsx             fonts, hydration gate, portal + sheet hosts
    garage.tsx              car switcher
    settings.tsx
    sign-in.tsx             only reachable when a backend is configured
    car/[id]/               per-car stack
      (tabs)/               dashboard, timeline, maintenance, issues, notes, stats
      service/[serviceId]   service detail (spec-sheet layout)
      issue/[issueId]       issue detail + resolve flow
      members.tsx           who this car is shared with
  theme/                    tokens (single source of all color/type/space/motion), haptics, reduce-motion policy
  db/                       SQLite: WAL, user_version migrations, DAOs, seed, sync outbox
  stores/                   Zustand: hydrate once behind the splash, write-through mutations
  sync/                     the engine (push, pull, reconcile), wire mapping, sharing calls
  lib/                      derived logic: reminder urgency, health score, timeline merge, stats, formatting
supabase/
  migrations/               Postgres schema, row level security, sharing functions
  components/
    ui/                     primitives: AppText, Card, Button, Pill, bespoke Icon set, Portal, Skeleton, EmptyState
    signature/              the hero moments: Odometer, HealthGauge, RadialFab, TimelineRail, SeverityDial, SpendChart, RewardPulse, ExpandingHero
    sheets/                 gesture-driven create/edit sheets + SheetHost
```

Data flow: SQLite is the source of truth. Stores hydrate once at startup (the splash screen holds until fonts and data are ready), then every mutation writes through the DAO and mirrors in memory. Components never touch the database, and never wait on the network.

Sync sits behind that rather than in front of it. Every local change is queued in an outbox as it is written; the engine pushes the queue, pulls what changed elsewhere, writes it to SQLite, and asks the stores to re-read. A change made on a plane is indistinguishable from one made on wifi, except for when it lands.

Design system: [DESIGN.md](DESIGN.md) documents every token, the motion policy (springs only for what you touch, every animation has a reduce-motion fallback), the icon grammar, and the locked implementation approach for each signature moment. Nothing outside `src/theme` hardcodes a color, size, or spring.

## Stack

Expo SDK 54 · TypeScript strict · expo-router v6 · Reanimated 4 (UI-thread worklets) · @shopify/react-native-skia · @shopify/flash-list v2 · @gorhom/bottom-sheet v5 · Zustand · expo-sqlite · date-fns · @supabase/supabase-js (optional). Runs in Expo Go: no custom native code.

SDK 54 is pinned deliberately. Expo Go supports exactly one SDK at a time, so do not bump it without confirming the Expo Go install moved too.
