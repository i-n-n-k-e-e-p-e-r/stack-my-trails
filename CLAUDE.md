# Stack My Trails

React Native (Expo 54) app that reads workout routes from Apple Health and stacks them on a single Apple Maps view, creating a heatmap-like visualization of your training routes.

## Tech Stack

- **Runtime:** Expo 54, React Native 0.81, TypeScript
- **Navigation:** Expo Router (file-based), 3 tabs + modal
- **HealthKit:** `@kingstinct/react-native-healthkit` v13 (Nitro Modules / JSI)
- **Maps:** `react-native-maps` with Apple Maps (no API key needed)
- **Storage:** `expo-sqlite` for caching imported trail data
- **Date Picker:** `@react-native-community/datetimepicker`
- **Build:** Dev client build required (has `ios/` directory, not Expo Go)

## Project Structure

```
app/
  _layout.tsx             — Root layout (SQLiteProvider + ThemeProvider + Stack)
  filter-modal.tsx        — Modal: date range + area selection filters
  (tabs)/
    _layout.tsx           — Tab layout (Trails, Stack, Settings)
    index.tsx             — Tab 1: trail list with preview map
    stack.tsx             — Tab 2: stacked trails map
    settings.tsx          — Tab 3: import + stats
hooks/
  use-trails.ts           — SQLite → clustering for stack view
  use-import-trails.ts    — HealthKit → SQLite import with progress
lib/
  db.ts                   — SQLite database layer (schema, CRUD, migrations, label cache)
  geo.ts                  — Bounding box, haversine, Douglas-Peucker simplification, union-find clustering
components/
  (various themed components from Expo template)
constants/
  theme.ts                — Colors and Fonts
```

## Architecture

```
HealthKit → [Import with progress] → SQLite → [Fast read] → Clustering → Map
```

- **Import is explicit** — user taps "Import" in Settings tab, progress bar shows
- **Display reads from SQLite only** — fast, no HealthKit calls on render
- **Coordinates simplified on import** — Douglas-Peucker algorithm, 80-90% point reduction
- **Cluster labels cached** in `cluster_labels` table (reverse geocoding)
- **Schema versioned** — `schema_version` table tracks migrations

## Key Patterns

### HealthKit Integration
- Package: `@kingstinct/react-native-healthkit`
- Import types from `@kingstinct/react-native-healthkit/types` (NOT `/types/Workouts`)
- Permissions: `HKWorkoutTypeIdentifier` + `HKWorkoutRouteTypeIdentifier`
- Workout objects are `WorkoutProxy` — call `workout.getWorkoutRoutes()` for GPS data
- Weather data available on `BaseSample`: `metadataWeatherTemperature` (Quantity), `metadataWeatherCondition` (enum)
- Activity types: running=37, walking=52, cycling=13, hiking=24

### SQLite Storage
- Database: `trails.db`, initialized via `SQLiteProvider` in root layout
- `expo-sqlite` modern API (not `/legacy`), async methods
- Schema v2: trails table with weather columns (temperature, weather_condition)
- Coordinates stored as simplified JSON strings
- Label cache: rounded lat/lng (1 decimal, ~11km resolution) as composite PK

### Coordinate Simplification (Crash Fix)
- **Problem:** Raw GPS routes have thousands of points, rendering 50+ trails = OOM crash
- **Fix:** Douglas-Peucker algorithm in `lib/geo.ts:simplifyCoordinates()`
- Applied at import time (tolerance=0.00005), stored simplified
- Stack view also caps at 50 trails per render
- Existing data requires re-import after adding simplification

### Geographic Clustering
- Union-find algorithm in `lib/geo.ts:clusterTrails()` (5km threshold)
- Cluster labels: SQLite cache → `MapView.addressForCoordinate()` fallback

### Apple Maps
- No config plugin for react-native-maps (don't add to plugins array!)
- `mapType="mutedStandard"` for subtle background
- Polylines: `rgba(255, 59, 48, 0.35)` for stacking, `rgba(255, 59, 48, 0.8)` for single trail preview
- `fitToCoordinates()` to auto-zoom

## Known Issues & Lessons

- **Config plugins require prebuild:** `npx expo prebuild --platform ios --clean` after adding native modules
- **react-native-maps has NO config plugin** — don't add it to app.json plugins
- **expo-sqlite needs prebuild** — it's a native module
- **Coordinate simplification is critical** — without it, >50 trails on map = crash
- **HealthKit import is sequential** — ~1-2s per workout, must be explicit with progress UI
- **Reverse geocoding must be cached** — `MapView.addressForCoordinate()` is async/slow
- **Schema migrations** — use version table, ALTER TABLE with .catch() for idempotency
- **Filter modal uses URL params** — pass cluster data as JSON string via router params

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
