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
- **Build:** Dev client build required (has `ios/` directory, not Expo Go)

## Project Structure

```
app/
  _layout.tsx             — Root layout (SQLiteProvider + ThemeProvider + Stack)
  filter-modal.tsx        — Modal: date range + area selection filters (two-level: city groups → sub-areas)
  (tabs)/
    _layout.tsx           — Tab layout (Trails, Stack, Settings)
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
components/
  (various themed components from Expo template)
constants/
  theme.ts                — Colors (incl. trail stroke colors per theme) and Fonts
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

### Coordinate Simplification (Crash Fix)
- **Problem:** Raw GPS routes have thousands of points, rendering 50+ trails = OOM crash
- **Fix:** Douglas-Peucker algorithm in `lib/geo.ts:simplifyCoordinates()`
- Applied at import time (tolerance=0.00005), stored simplified
- Stack view also caps at 50 trails per render
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

### Theme System
- `contexts/theme.tsx`: ThemeProvider using `Appearance.setColorScheme()`
- Persisted in SQLite settings table (light/dark/auto)
- `.catch(() => {})` on getSetting/setSetting to handle table not existing during migration
- Maps use `userInterfaceStyle={colorScheme}` for dark/light map styling
- Trail colors in `constants/theme.ts`: dark = warm orange, light = deep red

### Apple Maps
- No config plugin for react-native-maps (don't add to plugins array!)
- `mapType="mutedStandard"` for subtle background
- `userInterfaceStyle={colorScheme}` for dark/light map
- Trail colors from theme: `colors.trailStroke` / `colors.trailStrokeStacked`
- `fitToCoordinates()` to auto-zoom

### Tab Refresh Pattern
- Use `useFocusEffect` (from expo-router) instead of `useEffect` for data that should refresh when switching tabs
- Trails tab reloads summaries on focus (picks up new imports immediately)
- Stack tab checks trail count on focus (shows empty state vs map)

### Filter Modal
- Loads all trail summaries from DB, groups by stored `location_label`
- Date range fixed on top, scrollable area list below
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

## App Config Notes

- `app.json` plugins: `expo-router`, `expo-splash-screen`, `@kingstinct/react-native-healthkit`, `expo-sqlite`, `@react-native-community/datetimepicker`
- HealthKit plugin: `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription: false`, `background: false`
- New Architecture enabled (`newArchEnabled: true`)
- Typed routes enabled (`experiments.typedRoutes: true`)
- `expo-location` added for reverse geocoding (no special plugin needed)
