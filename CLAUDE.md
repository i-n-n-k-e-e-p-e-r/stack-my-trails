# Stack My Trails

React Native (Expo 54) app that reads workout routes from Apple Health and stacks them on a single Apple Maps view, creating a heatmap-like visualization of your training routes.

## Tech Stack

- **Runtime:** Expo 54, React Native 0.81, TypeScript
- **Navigation:** Expo Router (file-based), 3 tabs + modal
- **HealthKit:** `@kingstinct/react-native-healthkit` v13 (Nitro Modules / JSI)
- **Maps:** `react-native-maps` with Apple Maps (no API key needed)
- **Storage:** `expo-sqlite` for caching imported trail data
- **Geocoding:** `expo-location` for reverse geocoding (shared `lib/geocode.ts`)
- **Date Picker:** `@react-native-community/datetimepicker`
- **Theming:** Custom ThemeProvider (`contexts/theme.tsx`) with light/dark/auto, persisted in SQLite settings table
- **Typography:** Geist font (4 weights: Regular, Medium, SemiBold, Bold) bundled in `assets/fonts/`
- **Icons:** Feather icons via `@expo/vector-icons` (navigation, layers, sliders, filter)
- **Build:** Dev client build required (has `ios/` directory, not Expo Go)

## Project Structure

```
app/
  _layout.tsx             — Root layout (SQLiteProvider + ThemeProvider + font loading + Stack)
  filter-modal.tsx        — Modal: date range + area selection filters (two-level: city groups → sub-areas)
  (tabs)/
    _layout.tsx           — Custom tab bar (floating capsule, Feather icons, circle active state)
    index.tsx             — Tab 1: trail list with preview map, empty state with import link
    stack.tsx             — Tab 2: stacked trails map with label-based area filtering
    settings.tsx          — Tab 3: import + theme selector + delete all data
hooks/
  use-trails.ts           — SQLite → clustering for stack view, optional label-based filtering
  use-import-trails.ts    — HealthKit → SQLite import with progress, GPS spoofing filter
lib/
  db.ts                   — SQLite database layer (schema v7, CRUD, migrations, label cache, settings)
  geo.ts                  — Bounding box, haversine, Douglas-Peucker, clustering, GPS outlier filter
  geocode.ts              — Shared reverse geocoding: SQLite cache → expo-location fallback
contexts/
  theme.tsx               — ThemeProvider with Appearance.setColorScheme() + SQLite persistence
assets/
  fonts/                  — Geist-Regular.otf, Geist-Medium.otf, Geist-SemiBold.otf, Geist-Bold.otf
constants/
  theme.ts                — B&W + accent color palette, Geist font tokens
```

## Architecture

```
HealthKit → [GPS filter + simplify] → SQLite → [Fast read] → Clustering → Map
```

- **Import is explicit** — user taps "Import" in Settings tab, progress bar shows
- **"Fetch New Routes"** — only imports workouts newer than the last imported trail date
- **"Delete All Data"** — clears trails + label cache with confirmation dialog
- **Display reads from SQLite only** — fast, no HealthKit calls on render
- **GPS spoofing filter on import** — speed-based + median distance (see below)
- **Coordinates simplified on import** — Douglas-Peucker algorithm, 80-90% point reduction
- **Per-trail location labels** — stored in `location_label` column at import time, stable across re-imports
- **Cluster labels cached** in `cluster_labels` table (reverse geocoding via expo-location)
- **Schema versioned** — `schema_version` table tracks migrations (currently v7)

## Design System

### Visual Language
- **B&W + one accent color** — stark black and white with `#FCC803` (yellow) as the single accent
- **Solid borders** — no blur, no transparency, no glassmorphism
- **Full rounded corners** — capsule shapes (`borderRadius: 999`) on buttons, tab bar, top card; `borderRadius: 24` on cards
- **Border width: 1.5** on cards and containers; thicker `2.5` on selected trail card
- **Geist font** — cross-platform (future Android), 4 weights loaded via `expo-font` + `SplashScreen` gate

### Color Tokens (`constants/theme.ts`)
- `text` / `textSecondary` — primary and muted text
- `background` / `surface` — screen bg and card bg
- `accent` — `#FCC803` yellow, same in both themes
- `border` — solid dark (`#212529` light, `#FFFFFF` dark)
- `borderLight` — subtle dividers inside cards (`#DEE2E6` light, `#495057` dark)
- `trailStroke` / `trailStrokeStacked` — light: dark ink `rgba(33,37,41)`, dark: yellow `rgba(252,200,3)`
- `buttonText` — always `#212529` (dark text on yellow accent buttons)

### Tab Bar
- **Custom `tabBar` component** — full control, not fighting React Navigation's internal layout
- Floating capsule centered at bottom, auto-sized to fit 3 circle buttons
- Active state: filled circle (`colors.text` bg) with inverted icon (`colors.surface`)
- Inactive: same `colors.text` icon color, no background
- `tabBarWrapper` uses `alignItems: 'center'` for horizontal centering
- Icons: `navigation` (trails), `layers` (stack), `sliders` (settings)

### Active/Selected States
- Tab bar: inverted circle (dark circle + white icon on light, white circle + dark icon on dark)
- Trail cards: thicker border (2.5 vs 1.5), same surface background
- Filter preset chips: accent bg + dark text
- Theme segments: accent bg + dark text, inactive has border + text color

## Key Patterns

### HealthKit Integration
- Package: `@kingstinct/react-native-healthkit`
- Import types from `@kingstinct/react-native-healthkit/types` (NOT `/types/Workouts`)
- Permissions: `HKWorkoutTypeIdentifier` + `HKWorkoutRouteTypeIdentifier`
- Workout objects are `WorkoutProxy` — call `workout.getWorkoutRoutes()` for GPS data
- Weather data available on `BaseSample`: `metadataWeatherTemperature` (Quantity), `metadataWeatherCondition` (enum)
- Activity types: running=37, walking=52, cycling=13, hiking=24, swimming=46
- Date filtering via `filter.date.startDate` (NOT a top-level `from` param)
- `WorkoutQueryOptions` has no `from` field — use `filter: { date: { startDate } }` alongside `OR`
- GPS route locations have `loc.date` (timestamp) — used for speed-based filtering

### GPS Spoofing Filter (`lib/geo.ts:filterGpsOutliers()`)
- **Problem:** GPS jamming/spoofing (e.g., in Israel during wartime) creates points hundreds of km or neighborhoods away from actual location
- **Solution:** Two-stage filter using timestamps:
  1. **Speed filter (primary):** Computes median speed across all consecutive points, sets max = `medianSpeed × 5` (min 15 km/h). Forward scan: each point must be reachable from the last accepted point at max speed — physically impossible jumps are dropped
  2. **Median distance filter (cleanup):** Iterative (3 passes), removes points > `medianDist × 3` (min 0.3 km) from trail center
- Applied at import time before simplification, uses `TimedCoordinate` (lat/lng/timestamp)
- Requires `loc.date.getTime()` from HealthKit route locations

### SQLite Storage
- Database: `trails.db`, initialized via `SQLiteProvider` in root layout
- `expo-sqlite` modern API (not `/legacy`), async methods
- Schema v7: trails table + weather columns + `location_label` column + settings table + label cache cleanup migrations
- `location_label` stored per trail at import time via `resolveLabel()` — ensures stable labels across re-imports
- Coordinates stored as simplified JSON strings
- Label cache: rounded lat/lng (1 decimal, ~11km resolution) as composite PK
- Settings table: key-value store for theme preference etc. (getSetting/setSetting with .catch() for safety)
- Label-based queries: `getTrailSummariesByLabels()` for exact area filtering (replaces bbox overlap)

### Reverse Geocoding (`lib/geocode.ts`)
- Shared `resolveLabel(db, center)` — checks SQLite cache first, falls back to `expo-location`
- Uses `addr.district`, `addr.city`, `addr.region` with deduplication
- Dedup removes exact matches AND prefix matches (e.g., "Minsk Region" dropped when "Minsk" exists)
- Called during import to store `location_label` per trail — labels are stable across re-imports
- Also used by trails tab for display labels

### Coordinate Simplification
- **Problem:** Raw GPS routes have thousands of points per trail
- **Fix:** Douglas-Peucker algorithm in `lib/geo.ts:simplifyCoordinates()`
- Applied at import time (tolerance=0.00005), stored simplified — 80-90% point reduction
- **Two-tier rendering:** stack view caps at 500 trails; when >100 trails rendered, re-simplifies at render time with coarser tolerance (0.0002) to keep total point count manageable
- Re-simplification is render-only — stored data keeps full fidelity
- Existing data requires re-import after adding simplification

### Geographic Clustering & Area Grouping
- Fine-grained: Union-find algorithm in `lib/geo.ts:clusterTrails()` (5km threshold) — used for unfiltered stack view
- City-level: Centroid-seeded grouping in `groupClustersByProximity()` (20km, no chaining)
  - Largest cluster seeds each group, others join if within 20km of seed center
  - Prevents chaining distant areas (e.g., Haifa + Yodfat)
- **Filter modal groups by stored `location_label`** — no clustering/geocoding at filter time
  - Groups labels by city suffix (after last comma), sub-areas by locality prefix
  - Sub-areas with same locality name are merged (counts combined)
  - Passes `areaLabels` (JSON array of label strings) to stack screen, NOT bbox
- `useTrails` hook accepts `labels?: string[]` — uses `getTrailSummariesByLabels()` for exact matching

### Font Loading
- Geist font loaded via `useFonts()` from `expo-font` in `app/_layout.tsx`
- `SplashScreen.preventAutoHideAsync()` gates app render until fonts are ready
- Font tokens in `constants/theme.ts`: `Fonts.regular`, `.medium`, `.semibold`, `.bold`

### Theme System
- `contexts/theme.tsx`: ThemeProvider using `Appearance.setColorScheme()`
- Persisted in SQLite settings table (light/dark/auto)
- `.catch(() => {})` on getSetting/setSetting to handle table not existing during migration
- Maps use `userInterfaceStyle={colorScheme}` for dark/light map styling
- Trail colors: light = dark ink (`#212529` based), dark = accent yellow (`#FCC803` based)

### Apple Maps
- No config plugin for react-native-maps (don't add to plugins array!)
- `mapType="mutedStandard"` for subtle background
- `userInterfaceStyle={colorScheme}` for dark/light map
- `showsPointsOfInterest={false}` + `showsBuildings={false}` to reduce map noise
- Trail colors from theme: `colors.trailStroke` / `colors.trailStrokeStacked`
- `fitToCoordinates()` to auto-zoom

### Tab Bar (Custom Component)
- Custom `tabBar` prop on `<Tabs>` — bypasses React Navigation's internal layout completely
- `tabBarWrapper`: absolute positioned, `left: 0, right: 0, alignItems: 'center'` for centering
- `tabBar`: `flexDirection: 'row'`, `gap: 12`, auto-sized with padding — no fixed width needed
- Icons wrapped in `iconCircle` (46×46, borderRadius: 23) with conditional fill for active state
- Much more reliable than fighting `tabBarStyle` for custom shapes

### Tab Refresh Pattern
- Use `useFocusEffect` (from expo-router) instead of `useEffect` for data that should refresh when switching tabs
- Trails tab reloads summaries on focus (picks up new imports immediately)
- Stack tab checks trail count on focus (shows empty state vs map)

### Filter Modal
- Loads all trail summaries from DB, groups by stored `location_label`
- Date range fixed on top, area list scrolls **inside** the bordered card (card is outer container, ScrollView inside)
- Presets: 1D, 1W, 1M, 6M, 1Y, All
- Passes `areaLabels` (JSON array) + `areaLabel` (display string) back to stack screen via router params
- Uses index-based keys and expand tracking (not labels, which can collide)

## Known Issues & Lessons

- **Config plugins require prebuild:** `npx expo prebuild --platform ios --clean` after adding native modules
- **react-native-maps has NO config plugin** — don't add it to app.json plugins
- **expo-sqlite needs prebuild** — it's a native module
- **Coordinate simplification is critical** — without it, >50 trails on map = crash
- **HealthKit import is sequential** — ~1-2s per workout, must be explicit with progress UI
- **Reverse geocoding must be cached** — `expo-location` reverseGeocodeAsync is async/slow
- **Schema migrations** — use version table, ALTER TABLE with .catch() for idempotency
- **Filter modal uses URL params** — pass `areaLabels` (JSON array) + `areaLabel` (display string) via router params
- **Label-based filtering > bbox filtering** — bbox overlap causes inconsistent trail counts; label-based is exact
- **Per-trail labels > cluster-center geocoding** — cluster centroids shift between imports causing label instability; storing labels per trail at import time is stable
- **Geocoder dedup needed** — expo-location often returns same value for city/region (e.g., "Minsk, Minsk"); use prefix-based dedup
- **GPS spoofing in Israel** — government GPS jamming during war creates points in Amman/Beirut; speed-based filter with timestamps is most effective approach
- **ThemeProvider must handle missing settings table** — wrap getSetting/setSetting in .catch() since it may run before migration
- **Duplicate React keys** — area groups can have same label; use array index, not label, for keys and expand tracking
- **Map overlay approaches that DON'T work on Apple Maps:**
  - `Polygon` inside MapView (world-spanning coordinates don't render)
  - `LocalTile` with semi-transparent PNG (alpha not preserved during tile scaling, covers entire map opaque)
  - `View` overlay with `pointerEvents="none"` (dims both map AND polylines equally — polylines are native MapView children)
- **React Navigation tab bar layout issues** — `tabBarStyle` positioning (left/right/width) and `tabBarItemStyle` centering are unreliable for custom shapes; use custom `tabBar` component instead
- **Geist font loading** — must gate app render with `useFonts()` + `SplashScreen.preventAutoHideAsync()` to prevent FOUT
- **Filter modal scroll containment** — ScrollView must be INSIDE the bordered card View (not wrapping it) so content clips to rounded corners

## Build & Run

```bash
# Development (on connected iPhone)
npx expo run:ios --device

# After adding native modules
npx expo prebuild --platform ios --clean
npx expo run:ios --device

# Type check
npx tsc --noEmit

# Lint
npx expo lint
```

## Next Up: Phase 2 — Export / Poster Flow

> **For the next agent:** Phase 1 (visual overhaul) is complete. Phase 2 is the export feature. Start here.

### Context Files to Read First
1. **`docs/plans/2026-02-09-visual-overhaul-and-export-design.md`** — Full design document covering both phases. Phase 2 section has the complete spec for the export flow including Skia rendering, poster themes, and UI.
2. **`styles-refactoring/StackMyTrails_Blueprint.md`** — Original app blueprint with export flow concepts
3. **`styles-refactoring/exported-posters-variants.webp`** — Visual reference for poster output styles
4. **`styles-refactoring/pallete.json`** — Design palette (`#212529` dark, `#F5F6F7` light, `#FCC803` accent)
5. **`constants/theme.ts`** — Current B&W + accent color tokens (use these, don't reinvent)
6. **`app/(tabs)/stack.tsx`** — Stack map screen (the export button will live here)
7. **`hooks/use-trails.ts`** — Trail data loading + clustering (export will consume same data)

### What Phase 2 Involves
- **New dependencies:** `@shopify/react-native-skia`, `react-native-view-shot`, `expo-media-library` (all require prebuild)
- **Skia canvas rendering** with additive blending for true heatmap intensity visualization
- **3 poster themes:**
  - **Noir** — dark bg, **neon glow effect** with cold-to-hot color gradient (blue→cyan→green→yellow→red) based on trail overlap frequency. Most-visited areas glow hot, less-visited glow cold.
  - **Architect** — light bg, dark trails
  - **Minimalist** — white bg, single accent color
- **Export modal/screen** with: poster preview, theme selector, intensity slider, label stamp toggle, high-res PNG export to camera roll
- **The export button** should be added to the Stack screen (next to or replacing the filter button, or as a separate action)
- **Two-tier rendering:** Live map uses opacity stacking (current), export uses Skia additive blending for premium output

### Design Decisions Already Made
- Trail coloring by **intensity** (overlap frequency), NOT per-activity type
- Opacity stacking on live map, Skia for export — two-tier approach
- Keep `StyleSheet.create()` (no NativeWind)
- B&W + `#FCC803` accent design language carries into export UI
- Capsule buttons, solid borders, Geist font — same visual language

### Important Notes
- After installing Skia/view-shot/media-library: `npx expo prebuild --platform ios --clean && npx expo run:ios --device`
- Skia's `Canvas` is NOT a MapView — you render trail coordinates directly onto a Skia canvas for the poster
- The poster is a static image, not an interactive map — transform trail coordinates to canvas pixel space
- Check Skia compatibility with Expo 54 / New Architecture before installing

## App Config Notes

- `app.json` plugins: `expo-router`, `expo-splash-screen`, `@kingstinct/react-native-healthkit`, `expo-sqlite`, `@react-native-community/datetimepicker`
- HealthKit plugin: `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription: false`, `background: false`
- New Architecture enabled (`newArchEnabled: true`)
- Typed routes enabled (`experiments.typedRoutes: true`)
- `expo-location` added for reverse geocoding (no special plugin needed)
