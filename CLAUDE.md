# Stack My Trails

React Native (Expo 54) app that reads workout routes from Apple Health and stacks them on a single Apple Maps view, creating a heatmap-like visualization of your training routes.

## Tech Stack

- **Runtime:** Expo 54, React Native 0.81, TypeScript
- **Navigation:** Expo Router (file-based), single "Map" tab
- **HealthKit:** `@kingstinct/react-native-healthkit` v13 (Nitro Modules / JSI)
- **Maps:** `react-native-maps` with Apple Maps (no API key needed)
- **Storage:** `expo-sqlite` for caching imported trail data
- **Build:** Dev client build required (has `ios/` directory, not Expo Go)

## Project Structure

```
app/
  _layout.tsx             — Root layout (SQLiteProvider + ThemeProvider + Stack)
  (tabs)/
    _layout.tsx           — Tab layout (single Map tab)
    index.tsx             — Main map screen with import + display
components/
  area-picker.tsx         — Horizontal scroll cluster chips
  date-range-picker.tsx   — 1M/3M/6M/1Y/All preset buttons
hooks/
  use-trails.ts           — SQLite-backed trail query + clustering
  use-import-trails.ts    — HealthKit → SQLite import with progress tracking
lib/
  db.ts                   — SQLite database layer (init, CRUD, label cache)
  geo.ts                  — Bounding box, haversine, union-find clustering
constants/
  theme.ts                — Colors and Fonts
```

## Architecture

```
HealthKit → [Import with progress] → SQLite → [Fast read] → Clustering → Map
```

- **Import is explicit** — user taps "Import" button, progress bar shows
- **Display reads from SQLite only** — fast, no HealthKit calls on every render
- **Coordinates stored as JSON strings** in SQLite, parsed on read
- **Cluster labels cached** in `cluster_labels` table (reverse geocoding)

## Key Patterns

### HealthKit Integration
- Package: `@kingstinct/react-native-healthkit`
- Import types from `@kingstinct/react-native-healthkit/types` (NOT `/types/Workouts`)
- Permissions needed: `HKWorkoutTypeIdentifier` + `HKWorkoutRouteTypeIdentifier`
- Workout objects are `WorkoutProxy` — call `workout.getWorkoutRoutes()` for GPS data
- Each route has `.locations[]` with `{ latitude, longitude, altitude, speed, course, date }`
- Activity types: running=37, walking=52, cycling=13, hiking=24

### SQLite Storage
- Database: `trails.db`, initialized via `SQLiteProvider` in root layout
- `expo-sqlite` modern API (not `/legacy`), async methods
- Trails table: one row per workout, coordinates as JSON string
- Bounding box columns for efficient spatial-ish queries
- Label cache: rounded lat/lng (1 decimal, ~11km resolution) as composite PK

### Geographic Clustering
- Workouts clustered by bounding box center distance (5km threshold)
- Union-find algorithm in `lib/geo.ts`
- Cluster labels: check SQLite cache first, then `MapView.addressForCoordinate()`

### Apple Maps
- Provider: default (Apple Maps on iOS), no config plugin needed for react-native-maps
- `mapType="mutedStandard"` for subtle background
- Polylines with semi-transparent red (`rgba(255, 59, 48, 0.35)`) for stacking effect
- `fitToCoordinates()` to auto-zoom to selected cluster

## Known Issues & Lessons

- **Config plugins require prebuild:** When adding native modules, run `npx expo prebuild --platform ios --clean` to regenerate the ios/ directory with entitlements and Info.plist entries
- **react-native-maps has NO config plugin** — don't add it to the plugins array in app.json
- **Large datasets crash with in-memory approach** — loading all route coordinates from HealthKit for >6 months causes OOM. SQLite caching fixes this.
- **HealthKit import is slow** — fetching routes one-by-one is sequential (~1-2s per workout). Import must be explicit with progress UI, not done on every app launch.
- **Reverse geocoding must be cached** — `MapView.addressForCoordinate()` is async and slow. Cache results in SQLite.
- **expo-sqlite needs prebuild** — it's a native module, requires `npx expo prebuild --platform ios --clean` after install

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

- `app.json` plugins: `expo-router`, `expo-splash-screen`, `@kingstinct/react-native-healthkit`, `expo-sqlite`
- HealthKit plugin options: `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription: false`, `background: false`
- New Architecture enabled (`newArchEnabled: true`)
- Typed routes enabled (`experiments.typedRoutes: true`)
