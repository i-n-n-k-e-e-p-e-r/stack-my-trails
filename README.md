<div align="center">
  <img src="assets/images/icons/icon.png" width="120" alt="Stack My Trails" />
  <h1>Stack My Trails</h1>
  <p><strong>Visualize your workout routes</strong></p>
  <p>
    Reads workout routes from Apple Health and stacks them on a single map —
    creating a beautiful heatmap-like visualization of your training.
  </p>
  <p>
    <img src="https://img.shields.io/badge/iOS-16.0+-000000?style=flat&logo=apple" alt="iOS 16+" />
    <img src="https://img.shields.io/badge/Expo-54-000020?style=flat&logo=expo" alt="Expo 54" />
    <img src="https://img.shields.io/badge/React_Native-0.81-61DAFB?style=flat&logo=react" alt="React Native 0.81" />
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript" alt="TypeScript" />
  </p>
</div>

---

## What it does

See all your runs, walks, hikes, and cycling routes layered together on a single map. Discover your favorite paths, explore patterns in your training, and turn your routes into art.

Pay once, own it forever. No subscriptions, no accounts, no cloud. Your data stays on your device.

## Features

- **Import** workout routes from Apple Health with one tap
- **Browse** all your trails in a scrollable list with preview maps
- **Stack** hundreds of routes on a single map view
- **Filter** by area, date range, and activity type (running, walking, cycling, hiking, swimming)
- **Export posters** with 4 visual themes — Noir, Architect, Minimalist, Clean
- **Customize** intensity, color tint, labels, and decorative frames
- **Frame and rotate** your poster for the perfect composition
- **Save** posters to your photo library or share them
- **Backup & restore** trail data via export/import files
- **Location overlay** — show your current position on the map
- **GPS spoofing filter** for accurate route display in affected areas
- Full **dark mode** support

## Poster Themes

| Theme | Description |
|-------|-------------|
| **Noir** | Dark background with glowing yellow trails |
| **Architect** | Navy tones with cool blue paths |
| **Minimalist** | Clean light background with dark ink trails |
| **Clean** | Pure map view with subtle trail overlay |

## Requirements

- iPhone with Apple Health workout route data
- iOS 16.0 or later
- Workouts must have GPS route data (Apple Watch or any GPS-enabled workout app)
- Location access is optional — only used to show your position on the map

## Privacy

Stack My Trails stores everything locally on your device. No accounts, no servers, no tracking. The only network request is to Apple's geocoding service during import to resolve route coordinates into place names. Once imported, everything works offline.

---

## Development

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Expo 54, React Native 0.81 |
| Language | TypeScript |
| Navigation | Expo Router (file-based) |
| HealthKit | `@kingstinct/react-native-healthkit` v13 (Nitro Modules / JSI) |
| Maps | `react-native-maps` (Apple Maps, no API key needed) |
| Storage | `expo-sqlite` |
| Geocoding | `expo-location` reverse geocoding with SQLite cache |
| Poster rendering | `@shopify/react-native-skia` |
| Typography | Geist (4 weights bundled) |

### Architecture

```
HealthKit → [GPS filter + simplify] → SQLite → [Fast read] → Clustering → Map
```

- Import is **explicit** — user taps Import, a progress bar shows
- Display reads from **SQLite only** — no HealthKit calls on render
- GPS spoofing filter on import: speed-based + median distance, removes physically impossible jumps
- Coordinates **simplified** with Douglas-Peucker on import (80–90% point reduction)
- Per-trail **location labels** stored at import time, stable across re-imports
- Schema versioned — `schema_version` table tracks migrations

### Project Structure

```
app/
  _layout.tsx             — Root layout (SQLiteProvider + ThemeProvider + font loading)
  filter-modal.tsx        — Date range + area selection filters
  export-modal.tsx        — Skia poster export (themes, intensity, label, save/share)
  (tabs)/
    _layout.tsx           — Custom floating capsule tab bar
    trails.tsx            — Trail list with preview map
    stack.tsx             — Stacked trails map + export button
    settings.tsx          — Import, theme selector, backup, delete
hooks/
  use-trails.ts           — SQLite → clustering for stack view
  use-import-trails.ts    — HealthKit → SQLite import with progress
lib/
  db.ts                   — SQLite schema, CRUD, migrations, settings
  geo.ts                  — Bounding box, haversine, Douglas-Peucker, clustering, GPS filter
  geocode.ts              — Reverse geocoding: SQLite cache → expo-location fallback
  export-store.ts         — Module-level store for trail data → export modal
  poster-renderer.ts      — Skia poster: coordinate transform, themes, path building
contexts/
  theme.tsx               — ThemeProvider (light/dark/auto, persisted in SQLite)
constants/
  theme.ts                — Color palette + Geist font tokens
```

### Build & Run

```bash
# Run on connected iPhone
npx expo run:ios --device

# Run on simulator
npx expo run:ios

# After adding native modules
npx expo prebuild --platform ios --clean
npx expo run:ios --device

# Type check
npx tsc --noEmit

# Lint
npx expo lint
```

> **Note:** This project uses a native dev client build (`ios/` directory present). Expo Go is not supported.

---

<div align="center">
  <sub>Built with Expo · React Native · HealthKit · Skia</sub>
</div>
