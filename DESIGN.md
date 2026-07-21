# Garage · Design System

Dark-first, automotive. The concept: **amber light in a warm-black world**. Every dark surface carries a warm undertone so the accent reads as emitted light (a sodium-vapor lamp in a night garage), not as a tint. Light mode is not an inversion; it is a **printed spec sheet**: paper, ink, hairline rules, stamped mono labels.

This file is the source of truth. All values live in `src/theme/tokens.ts`. No hardcoded colors, sizes, or durations anywhere else.

## 1. Color

### Dark ("night garage"), default

| Token | Hex | Role |
|---|---|---|
| `void` | `#0D0C0A` | App background, content on accent fills |
| `carbon` | `#16140F` | Base surface, tab bar, sheets |
| `graphite` | `#201C15` | Raised cards, inputs |
| `hairline` | `#332D22` | Decorative separators only |
| `strokeInteractive` | `#7A6E58` | Input borders, unselected controls (3.39:1 on graphite) |
| `bone` | `#F5F1E8` | Primary text (15:1 on graphite) |
| `sand` | `#C9C0B0` | Secondary text (9.4:1) |
| `dust` | `#A29883` | Muted text, placeholder (5.9:1) |
| `amber` | `#FFB000` | THE accent. Sodium-vapor. Fills, gauges, active states |
| `glowCore` | `#FFD24D` | Hot core inside Skia glows, pressed-state brighten only |
| `amberDim` | `#8A6A33` | "Upcoming" indicator: a dim lamp |
| `amberDisabled` | `#66512A` | Disabled accent |
| `redline` | `#FF4438` | Overdue, critical, destructive (4.95:1 on graphite) |
| `phosphor` | `#7BD88F` | Success, resolved, reward moments (9.7:1) |

Rules:
- Content on `amber`/`glowCore` fills is **always `void`**, never white (10.7:1).
- Pressed amber **brightens** to `glowCore` with a glow bloom; light emits more when touched, never less. Disabled dims to `amberDisabled`.
- Reminder escalation is one bulb brightening: `amberDim` (Upcoming) → `amber` (Due soon) → `redline` (Overdue).
- The reward pulse is `phosphor`, matching "resolved". Amber never signals success.
- Status is never color-only: state pills always carry a glyph + label (dot = Upcoming, clock = Due soon, triangle = Overdue).
- There is no info-blue. Mileage/info events use the neutral ramp with outlined glyphs.
- Glows are layered Skia blur (wide soft pass + tight `glowCore` pass), never a plain opacity fade.

### Light ("spec sheet")

| Token | Hex | Role |
|---|---|---|
| `paper` | `#FAF7F2` | Background |
| `card` | `#FFFFFF` | Raised cards |
| `surface2` | `#F1EDE6` | Inset surfaces, inputs |
| `hairline` | `#E4DCCE` | Decorative rules |
| `strokeInteractive` | `#8E8267` | Functional borders (3.8:1 on card) |
| `ink` | `#171410` | Primary text |
| `inkSecondary` | `#57503F` | Secondary text |
| `inkMuted` | `#6E6558` | Muted text (5.4:1) |
| `amberInk` | `#8A5A00` | Accent as text/icon/stroke (5.6:1) |
| `readyInk` | `#177A45` | Success text/icon (5.0:1) |
| `redlineInk` | `#C21F14` | Danger text/icon (5.6:1) |

- `amber #FFB000` survives in light mode **only as a fill** with `ink` content (10:1); any accent text/icon/stroke uses `amberInk`.
- Glows become soft tinted rings/shadows. Grain becomes faint paper noise.
- Semantic aliases (`accent`, `accentText`, `danger`, `success`, `statusUpcoming/DueSoon/Overdue`) resolve per scheme so components never branch on scheme.

## 2. Type

| Face | Package | Use |
|---|---|---|
| **Big Shoulders** 600/700 | `@expo-google-fonts/big-shoulders-display` | Display: screen titles, car names, section headers, score numerals. Condensed editorial poster energy |
| **Instrument Sans** 400/500/600 | `@expo-google-fonts/instrument-sans` | Body: everything readable |
| **Chivo Mono** 400/500 | `@expo-google-fonts/chivo-mono` | Machined numerals: odometer digits, gauge readouts, stamped uppercase labels, timeline km ticks |

Roles (size/line-height, face, weight):

- `displayXL` 40/44 BigShoulders 700 · car names, screen heroes
- `displayL` 28/32 BigShoulders 700 · section titles
- `title` 20/26 BigShoulders 600 · card titles
- `body` 16/23 Instrument 400 (500 medium, 600 semibold)
- `small` 14/20 Instrument 400/500
- `caption` 12/16 Instrument 400
- `label` 11/14 ChivoMono 500, UPPERCASE, +5% tracking · overlines, pills, gauge readouts. Never uppercase below 11
- `numHero` 64 ChivoMono 500, per-digit cells · dashboard odometer
- `numL` 32 ChivoMono 500 · card-level stats
- `numM` 24 ChivoMono 400 · row-level numerals

## 3. Space, radius, hit targets

- Space scale: `2, 4, 8, 12, 16, 20, 24, 32, 48, 64` (`space.xs2 … space.xl3`)
- Radii: `xs 8, sm 12, md 16, lg 22, xl 30, pill 999`
- Touch targets ≥ 44pt always. Radial FAB actions are 56pt with ≥8pt arc clearance.
- Depth: layered warm surfaces + hairlines + grain, not shadows.

## 4. Layout language (editorial rules)

- Dashboard hero is an **asymmetric cluster**: the odometer numeral oversized (`numHero` 64), left-aligned, allowed to run toward the edge; unit set small, baseline-aligned.
- Section headers are editorial: a `label` mono overline + `displayL` header sitting on a full-width hairline.
- Never two identical card widths adjacent on the dashboard.
- One full-bleed moment per screen (hero, chart, timeline rail).
- Stats mixes one oversized numeral against small supporting rows, never a uniform tile grid.
- A fine dot-matrix Skia backdrop sits behind the dashboard cluster (pixel-LCD echo). Graphite cards carry 2 to 3% Skia fractal-noise grain.

## 5. Iconography (bespoke, no icon libraries)

All icons are authored in-house in `src/components/ui/Icon.tsx` via react-native-svg:
- 24 grid, 1.5px stroke, round joins, **squared terminals with 45° cut ends** echoing gauge ticks.
- Active states may fill; default is stroked.
- Timeline node glyphs derive from the same grammar: wrench (service), severity triangle (issue), outline dot (note), odometer tick (mileage).

## 6. Signature moments (locked implementation approach)

1. **Odometer roll**: per-digit 0-9 strips, Reanimated springs on translateY with slight overshoot. ONE haptic on settle (at most 3 rhythmic ticks 60ms apart), routed through a single `runOnJS`. One shared glow canvas behind the whole digit row (pre-blurred radial), never per-digit blurs.
2. **Health gauge** (not an Apple ring): 240° sweep opening at the bottom, 40 minor + 8 major hairline ticks, permanent redline sector on the last 15%, thin Skia needle that overshoots and settles on a spring, score numeral in display face beneath the pivot. Color-lerp only the needle + active sweep (phosphor → amber → redline); ticks stay neutral.
3. **Living timeline**: ONE absolutely positioned Skia canvas renders the rail behind the FlashList, driven by a scroll shared value passed directly as a Skia prop. The rail is odometer tape: minor mileage ticks, occasional printed km values in mono caption. Entries settle with staggered springs; node glyphs are memoized SVG, never per-cell canvases. `getItemType` per event type. Each entry closes with a hairline divider on the content column only, so the rule never cuts across the rail, and entries that open a detail carry a right chevron. Mileage updates are not tappable and carry none.
4. **Expanding card**: detail screens are REAL expo-router routes. On press: `measureInWindow` the card, mount a clone in the root portal host, `router.push` with `animation: 'none'`, crossfade the clone out when the detail lays out. BackHandler collapses the clone then `router.back()`. One transition-progress shared value makes it interruptible. Reduce motion: skip the clone, plain fade.
5. **Sheets**: `@gorhom/bottom-sheet` v5, one `BottomSheetModalProvider` at root, `BottomSheetTextInput` for every input, `keyboardBehavior: 'extend'`, `keyboardBlurBehavior: 'restore'`, `android_keyboardInputMode: 'adjustResize'`, fixed snap points on keyboarded sheets, hardware back dismisses top sheet first.
6. **Severity gauge**: whole dial face is the pan surface + three ≥44pt tappable detent zones. Detent index latched in a shared value; haptic fires only on detent change. Needle springs to nearest detent on release. Exposed as an adjustable accessibility element (increment/decrement = detents). Gauge blocks the sheet's content-panning gesture.
7. **Radial FAB**: backdrop dim + 4 bloom actions (56pt, mono-caps labels) rendered in the root portal host as a fullscreen layer (Android clips child touches outside parent bounds). Actions bloom along a tachometer arc with tick marks between them; one open-progress shared value drives staggered springs; tap-dim-to-dismiss.
8. **Pull-to-refresh**, platform split decided up front: Android uses a tinted `RefreshControl` (amber on graphite). iOS derives pull distance from negative `contentOffset.y` via `useAnimatedScrollHandler` feeding a Skia gauge needle above the header. No extra pan gestures near lists, ever.
9. **Reward moment**: clearing an overdue service pulses a `phosphor` glow from the row + success haptic; the health gauge needle re-springs to the new score.

## 7. Motion policy

- All animation on the UI thread (Reanimated worklets, Skia props from shared values). No JS-thread layout animation.
- Springs for anything touched or interruptible; fixed durations only for fades under 200ms.
- Standard springs: `snappy {damping 18, stiffness 220}`, `settle {damping 14, stiffness 160}`, `bloom {damping 12, stiffness 180, overshootClamping false}`.
- Haptics punctuate meaning: save (`success` notification), destructive confirm (`warning`), detents and pickers (`selection`), odometer settle (single `light` impact). Never on scroll.
- **Reduce-motion fallback table** (enforced centrally via `useReducedMotion` in `src/theme/motion.ts`):
  - Odometer: set final digits with a single crossfade, no tick haptics
  - Health gauge: render final arc + numeral instantly
  - Timeline: rail fully drawn, entries appear unstaggered
  - Sheets: short non-spring translate
  - Severity gauge: snaps to detents without overshoot (drag itself remains, it is direct manipulation)
  - Radial FAB: actions fade in place
  - Pull-to-refresh: plain tinted RefreshControl on both platforms
  - Expanding card: plain fade push
  - Reward: static phosphor highlight + success haptic
- Screen entrances are choreographed: staggered 40 to 60ms per element group, springs, once per mount. Entrance and layout springs are **overshoot-clamped**: content arrives and stops, it never bounces past its resting place. Overshoot is reserved for the deliberate moments (odometer, gauge needle, FAB bloom).
- Loading = skeletons matching final layout. Empty states are designed, with a Skia/SVG drawing and one clear action.

## 8. Vocabulary (use these exact words everywhere)

- The section is **Service** ("Log service", "Service history", "Service reminders"). The route may be `/maintenance` but no user-facing string says maintenance.
- Reminder states: exactly `Upcoming`, `Due soon`, `Overdue`.
- Issue severities: exactly `Low`, `Medium`, `Critical`. Statuses: `Open`, `Monitoring`, `Fixed`.
- Actions are verbs: "Log service", "Update mileage", "Report issue", "Add note", "Add car".
- Errors say what happened and how to fix it: "Couldn't save. Add a title first."
- Numerals: mileage always grouped ("48,250 km"), money in the chosen currency ("EGP 1,450").
- Punctuation: no em or en dashes anywhere (UI copy, docs, code comments). Use commas, colons, periods, middots.
- Sharing roles: exactly `Owner`, `Editor`, `Viewer`. The section is **Sharing**, never "permissions" or "collaborators". People are added to a car, not "invited to a workspace".
- Sync never brags and never blames. State the fact: "Synced 4 minutes ago", "2 changes waiting to upload", "Cannot reach the server. Check your connection." Never "Syncing your data to the cloud!" and never a spinner with no words.

## 9. Architecture map

```
src/
  app/                    expo-router routes
    _layout.tsx           fonts, theme, providers, portal host, sheet host
    index.tsx             redirect: garage or active car dashboard
    garage.tsx            car switcher (hero cards)
    settings.tsx          theme, units, currency, export, account and sync
    sign-in.tsx           email and password, only when a backend is configured
    car/[id]/_layout.tsx  custom section tab bar
    car/[id]/members.tsx  sharing: people, roles, pending invitations
    car/[id]/index.tsx    dashboard
    car/[id]/timeline.tsx
    car/[id]/maintenance.tsx
    car/[id]/issues.tsx / issue/[issueId].tsx
    car/[id]/notes.tsx
    car/[id]/stats.tsx
  theme/                  tokens, ThemeProvider, motion, haptics
  db/                     sqlite (async API, WAL, user_version migrations), DAOs, seed
  stores/                 zustand: hydrate once at startup, write-through mutations
  sync/                   optional Supabase layer: outbox push, pull, reconcile, sharing
  components/ui/          AppText, Screen, Card, Button, Pill, Icon, Skeleton, EmptyState, SectionHeader, GrainOverlay
  components/signature/   Odometer, HealthGauge, TimelineRail, SeverityDial, RadialFab, RefreshGauge, ExpandingCard
  components/sheets/      one sheet per entity, sheet-manager store
  lib/                    derived logic: reminder status, health score, timeline merge, stats, format
```

Data flow: SQLite is the source of truth → zustand hydrates once behind the splash → mutations write through DAOs then update the store in memory. No queries in components or `renderItem`.

Sync, when configured, is strictly behind that line: it writes to SQLite and asks the stores to re-read. **No screen ever awaits the network.** There are no loading spinners on data, because there is nothing to wait for. The one exception is Sharing, which is a claim about another person's account and cannot be resolved offline; it says so plainly instead of pretending.
