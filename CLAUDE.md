# Stack My Trails

React Native (Expo 54) app that reads workout routes from Health and stacks them on a single Maps view, creating a heatmap-like visualization of your training routes.

## Tech Stack

- **Runtime:** Expo 54, React Native 0.81, TypeScript
- **Navigation:** Expo Router (file-based), 3 tabs + modals (filter, export)
- **HealthKit:** `@kingstinct/react-native-healthkit` v13 (Nitro Modules / JSI)
- **Maps:** `react-native-maps` with Maps (no API key needed)
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
  export-modal.tsx        — Modal: Skia poster export (theme picker, intensity, label, save/share)
  (tabs)/
    _layout.tsx           — Custom tab bar (floating capsule, Feather icons, circle active state)
    index.tsx             — Tab 1: trail list with preview map, empty state with import link
    stack.tsx             — Tab 2: stacked trails map with label-based area filtering + export button
    settings.tsx          — Tab 3: import + theme selector + delete all data
hooks/
  use-trails.ts           — SQLite → clustering for stack view, optional label-based filtering
  use-import-trails.ts    — HealthKit → SQLite import with progress, GPS spoofing filter
lib/
  db.ts                   — SQLite database layer (schema v7, CRUD, migrations, label cache, settings)
  geo.ts                  — Bounding box, haversine, Douglas-Peucker, clustering, GPS outlier filter
  geocode.ts              — Shared reverse geocoding: SQLite cache → expo-location fallback
  export-store.ts         — Module-level store for passing trail data to export modal
  poster-renderer.ts      — Skia poster rendering: coordinate transform, themes, path building, drawing
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
- Schema v8: trails table + weather columns + structured location columns (`location_country`, `location_region`, `location_city`) + legacy `location_label` + settings table + label cache
- Structured location stored per trail at import time via `resolveLocation()` — deterministic from geocoder
- Coordinates stored as simplified JSON strings
- Label cache: rounded lat/lng (1 decimal, ~11km resolution) as composite PK, stores `country|region|city|label` pipe-delimited format
- Settings table: key-value store for theme preference etc. (getSetting/setSetting with .catch() for safety)
- Location-based queries: `getTrailSummariesByLocation()` filters by country + optional region + optional city
- `getDistinctAreas()` returns all unique country/region/city combinations with counts

### Reverse Geocoding (`lib/geocode.ts`)
- `resolveLocation(db, center)` — returns `{ country, region, city, label }` from `addr.country`, `addr.region`, `addr.city`
- `resolveLabel(db, center)` — convenience wrapper, returns display label string
- Checks SQLite cache first, falls back to `expo-location`
- Display label uses `addr.district`, `addr.city`, `addr.region` with dedup (prefix matching)
- Called during import to store structured location per trail

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
- **Filter modal uses structured location columns** — 3-level accordion: Country → Region → City
  - `getDistinctAreas()` returns all unique combinations with counts
  - Smart flattening: single-entry levels are collapsed into flat rows
  - No rename, no drag-and-drop, no merge — deterministic from geocoder
- Filter store passes `country`/`region`/`city` strings (all nullable)
- `useTrails` hook accepts `country`/`region`/`city` — uses `getTrailSummariesByLocation()` for filtering

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

### Maps
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
- 3-level accordion: Country → Region → City, built from `getDistinctAreas()` query
- Smart flattening: single-region+single-city countries show as flat row; single-region countries skip region level
- Date range presets (1D, 1W, 1M, 1Y, All) + date pickers + activity type filter
- Selection: tap country = all trails in country, tap region = all in region, tap city = just that city
- Passes `country`/`region`/`city` to filter store (not router params)
- No rename, no drag-and-drop, no merge functionality

## Known Issues & Lessons

- **Config plugins require prebuild:** `npx expo prebuild --platform ios --clean` after adding native modules
- **react-native-maps has NO config plugin** — don't add it to app.json plugins
- **expo-sqlite needs prebuild** — it's a native module
- **Coordinate simplification is critical** — without it, >50 trails on map = crash
- **HealthKit import is sequential** — ~1-2s per workout, must be explicit with progress UI
- **Reverse geocoding must be cached** — `expo-location` reverseGeocodeAsync is async/slow
- **Schema migrations** — use version table, ALTER TABLE with .catch() for idempotency
- **Structured location columns** — `location_country`/`location_region`/`location_city` from geocoder, deterministic and stable across re-imports
- **Geocoder dedup needed** — expo-location often returns same value for city/region (e.g., "Minsk, Minsk"); use prefix-based dedup
- **GPS spoofing in Israel** — government GPS jamming during war creates points in Amman/Beirut; speed-based filter with timestamps is most effective approach
- **ThemeProvider must handle missing settings table** — wrap getSetting/setSetting in .catch() since it may run before migration
- **Duplicate React keys** — area groups can have same label; use array index for keys and expand tracking
- **Map overlay approaches that DON'T work on Maps:**
  - `Polygon` inside MapView (world-spanning coordinates don't render)
  - `LocalTile` with semi-transparent PNG (alpha not preserved during tile scaling, covers entire map opaque)
  - `View` overlay with `pointerEvents="none"` (dims both map AND polylines equally — polylines are native MapView children)
- **React Navigation tab bar layout issues** — `tabBarStyle` positioning (left/right/width) and `tabBarItemStyle` centering are unreliable for custom shapes; use custom `tabBar` component instead
- **Geist font loading** — must gate app render with `useFonts()` + `SplashScreen.preventAutoHideAsync()` to prevent FOUT
- **Filter modal scroll containment** — ScrollView wraps all filter sections; area card clips to rounded corners
- **expo-file-system modern API** — Expo 54 uses `File`, `Directory`, `Paths` classes (NOT legacy `cacheDirectory`/`writeAsStringAsync`). Write base64: `new File(Paths.cache, 'name.png').write(base64, { encoding: 'base64' })`
- **Skia offscreen surface for high-res export** — `Skia.Surface.Make(w, h)` creates CPU-backed surface at any resolution. Draw on `surface.getCanvas()`, then `surface.makeImageSnapshot().encodeToBase64(ImageFormat.PNG)`. Much better than ViewShot which is capped at screen resolution.
- **Skia Paragraph API for text** — `Skia.ParagraphBuilder.Make(style, provider)` with `Skia.TypefaceFontProvider.Make()` + `registerFont()`. Does NOT support emoji (no system font fallback). Use RN `<Text>` for preview (emoji), Skia Paragraph for high-res export (sharp text).
- **Skia font loading** — `Skia.Data.fromURI(localUri)` + `Skia.Typeface.MakeFreeTypeFaceFromData(data)`. Get local URI via `expo-asset`: `Asset.fromModule(require('path.otf')).downloadAsync()` → `asset.localUri`
- **ViewShot captures at screen resolution** — `captureRef` with `width: N` upscales, doesn't re-render. For a 350pt canvas on 3x device, max is ~1050px. Use Skia offscreen surface for higher res.
- **Scale stroke/glow for high-res export** — when rendering at 3000px instead of 350pt, multiply `strokeWidth` and `glowSigma` by `exportWidth / previewWidth` to maintain visual proportions
- **Trail blur at high intensity is expected** — wider strokes + Screen blending + corner smoothing create soft look. Fix: add a "sharp core pass" — thin bright line (strokeWidth * 0.35, opacity * 1.6) drawn on top for crisp centers
- **WYSIWYG export** — ViewShot captures everything including RN styling (borderRadius, borderWidth). Remove visual styling from ViewShot container for clean poster edges.
- **Decorative border with label** — use asymmetric bottom margin (12% for label area, 3.5% for sides). Fill margins with solid tintColor rects (covers trail edges). Draw gradient only when border is OFF.

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

## Phase 2: Export / Poster Flow (Implemented)

### Export Architecture
```
Stack Screen → [setExportData] → export-store → [getExportData] → Export Modal
  Preview: MapView + Skia Canvas (screen res)
  Export:  Skia.Surface.Make (3000×4000) → base64 PNG → expo-file-system → Camera Roll / Share
```

- **Framing on Stack tab** — user zooms/pans MapView to compose, then taps export. Visible map region is captured and used as coordinate bounds for the poster.
- **Module-level store** (`lib/export-store.ts`) passes trail data + visible region between screens (avoids serializing coordinates via router params)
- **Preview:** Skia `createPicture()` + `<Picture>` for real-time rendering at screen resolution
- **Export:** Offscreen `Skia.Surface.Make(3000, 4000)` renders at full resolution, bypassing ViewShot screen-resolution limitation
- **Additive blending** (`BlendMode.Screen`) — overlapping trails naturally intensify
- **Trail rendering:** 3-pass technique — glow (Noir only) → wide soft stroke → thin bright core line for sharp centers
- **Corner smoothing:** `Skia.PathEffect.MakeCorner(strokeWidth * 1.5)` for GPS trail paths; Chaikin's algorithm for native map Polylines

### Export Dependencies
- `@shopify/react-native-skia` — Skia canvas for poster rendering + offscreen surface for high-res export
- `react-native-view-shot` — MapView capture for poster background (export), preview display
- `expo-media-library` — Save to camera roll
- `expo-file-system` — Write base64 PNG to temp file for export (`File` + `Paths` new API, NOT legacy `cacheDirectory`)
- `@react-native-community/slider` — Intensity + tint sliders

### 4 Poster Themes (`lib/poster-renderer.ts`)
| Theme | Map Tint | Tint Opacity | Trail Color | Blend | Special |
|-------|----------|--------------|-------------|-------|---------|
| **Noir** | `#121212` | 0.88 | `#FCC803` yellow | Screen | Glow blur layer, dark map |
| **Architect** | `#1B2B48` navy | 0.85 | `#60A5FA` sky | Screen | Dark map, no glow |
| **Minimalist** | `#FAFAFA` off-white | 0.82 | `#1A1A2E` dark | Multiply | Light map, no glow |
| **Clean** | `#F5F6F7` | 0 | `#212529` dark | SrcOver | No tint, no glow |

### Export Modal (`app/export-modal.tsx`)
- Full-screen modal, registered in root layout
- **Layout (top→bottom):** header → label input (always visible) → poster preview → options row → sliders → buttons
- **Poster preview stack:** MapView (pale city roads) → theme tint overlay → transparent Skia canvas (trails)
- **Options row:** 4 theme color bullets | separator | 3 toggle buttons (label, map, border)
- **Sliders:** INTENSITY (stroke width + opacity) + TINT (HSL hue shift, only for Noir/Clean themes)
- **Decorative border:** Solid tint-colored margin with inner frame line; bottom margin enlarged for label ("picture with signature" style)
- **Label:** RN `<Text>` overlay in preview (supports emoji); Skia Paragraph API in high-res export (Geist-Bold, no emoji)
- **High-res export pipeline:**
  1. Capture MapView as base64 PNG (if map shown)
  2. `renderHighResPoster()` → offscreen Skia surface at 3000×4000
  3. Draws map bg (scaled), tint overlay, trails, border, gradient, label at full resolution
  4. Encodes to base64 PNG → writes to temp file via `expo-file-system`
- **Tint slider:** HSL hue rotation on trail color; Clean theme boosts saturation (0.65) and lightness (0.45) for vivid tints
- Cleanup: `clearExportData()` on unmount to free trail data from memory

### Coordinate Transform (`lib/poster-renderer.ts:buildTransform()`)
- Maps GPS lat/lng to Skia canvas pixel space using Web Mercator projection (matching Maps)
- Uses visible map region as bounds (matches user's framing on Stack tab)
- `cropRegionToAspect()` crops region to 3:4 poster aspect ratio using Mercator projection
- Falls back to trail bounding box if no region provided
- Single Mercator scale for both axes to preserve proportions

### Trail Smoothing (`lib/geo.ts:smoothCoordinates()`)
- **Chaikin's corner-cutting algorithm** — replaces each segment with 25%/75% interpolated points
- Applied to native map Polylines on Stack tab and Trails tab (1 iteration)
- Skia paths use `PathEffect.MakeCorner()` instead (Skia-native, more efficient)

### High-Res Export (`lib/poster-renderer.ts:renderHighResPoster()`)
- Creates `Skia.Surface.Make(3000, 4000)` offscreen CPU surface
- Scales strokeWidth and glowSigma proportionally (`exportWidth / previewWidth`)
- Map background: captured MapView image drawn scaled to fill (screen-res map is acceptable for muted bg)
- Label: Skia Paragraph API with Geist-Bold loaded via `Skia.Typeface.MakeFreeTypeFaceFromData()`
- Returns base64-encoded PNG string

### Performance
- Paths memoized separately from drawing (paths depend on trails/region, drawing depends on theme/opacity)
- Slider changes only re-create the Skia Picture (cheap), not the paths (expensive)
- Font typeface loaded once on modal mount via `expo-asset` + `Skia.Data.fromURI()`

### Known Limitations
- Emoji in label text works in preview (RN Text) but NOT in high-res export (Skia Paragraph has no emoji font fallback)
- No pinch-to-zoom on export canvas (framing is done on Stack tab's MapView instead)
- Map background in export is at screen resolution (captured via ViewShot); trails/border/label are at full 3000×4000 resolution
- Multi-color heatmap gradient (blue→red) not implemented (using single-color additive blending)

## App Config Notes

- `app.json` plugins: `expo-router`, `expo-splash-screen`, `@kingstinct/react-native-healthkit`, `expo-sqlite`, `@react-native-community/datetimepicker`, `expo-media-library`
- HealthKit plugin: `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription: false`, `background: false`
- Media library plugin: `photosPermission` + `savePhotosPermission` for camera roll access
- New Architecture enabled (`newArchEnabled: true`)
- Typed routes enabled (`experiments.typedRoutes: true`)
- `expo-location` added for reverse geocoding (no special plugin needed)
