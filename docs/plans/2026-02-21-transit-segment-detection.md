# Transit Segment Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop rendering GPS points recorded while on public transport, so contaminated workout trails show only the active movement segments with a clean gap where the transit happened.

**Architecture:** Store HealthKit's `loc.speed` (m/s) alongside each coordinate at import time. At render time, `splitByTransit(coords, activityType)` splits a flat `Coordinate[]` into `Coordinate[][]` — one sub-array per valid segment — by dropping points where speed exceeds an activity-specific threshold. Each segment becomes its own `Polyline` or Skia path; transit gaps are simply not drawn. Backward compatible: old coordinates have no `speed` field and render unchanged.

**Tech Stack:** TypeScript, `lib/geo.ts` (types + utility), `hooks/use-import-trails.ts` (HealthKit import), `app/(tabs)/stack.tsx` + `app/(tabs)/trails.tsx` (map rendering), `lib/poster-renderer.ts` (Skia export rendering)

---

### Task 1: Extend `Coordinate` type and add `splitByTransit` to `lib/geo.ts`

**Files:**
- Modify: `lib/geo.ts:1-4` (Coordinate interface)
- Modify: `lib/geo.ts:84-86` (TimedCoordinate interface — inherits speed via Coordinate)
- Modify: `lib/geo.ts` (add splitByTransit + helper after line 217)

**Step 1: Add `speed?` to the `Coordinate` interface**

In `lib/geo.ts`, change lines 1–4 from:
```typescript
export interface Coordinate {
  latitude: number;
  longitude: number;
}
```
to:
```typescript
export interface Coordinate {
  latitude: number;
  longitude: number;
  speed?: number; // m/s, from HealthKit CLLocation. undefined = legacy data, no transit filtering applied
}
```

`TimedCoordinate extends Coordinate` so it automatically inherits `speed?`. No change needed there.

Note on `filterGpsOutliers`: it currently returns `Coordinate[]` but internally pushes `TimedCoordinate` objects into the array. JavaScript preserves all object fields regardless of TypeScript types, so `speed` will flow through at runtime without any changes to that function body.

**Step 2: Add `getTransitSpeedThreshold` helper after `simplifyCoordinates` (after line 217)**

```typescript
/**
 * Returns the maximum "active workout" speed in m/s for a given HealthKit
 * activity type. Speeds above this threshold on consecutive GPS points indicate
 * the device was on public transport, not moving under its own power.
 *
 * Activity type constants: running=37, walking=52, cycling=13, hiking=24, swimming=46
 */
function getTransitSpeedThreshold(activityType: number): number {
  switch (activityType) {
    case 37: return 6;   // running: ~22 km/h catches buses, not fast recreational sprints
    case 52: return 3;   // walking: ~11 km/h, anything faster is a vehicle
    case 24: return 3;   // hiking: same as walking
    case 13: return 12;  // cycling: ~43 km/h catches trains; city buses; mountain cable cars (<40 km/h)
    case 46: return 3;   // swimming: not practically relevant but safe
    default:  return 8;  // ~29 km/h conservative fallback
  }
}
```

**Step 3: Add `splitByTransit` function immediately after `getTransitSpeedThreshold`**

```typescript
/**
 * Splits a coordinate array into segments, dropping points where speed exceeds
 * the activity's transit threshold. Each returned sub-array should be rendered
 * as a separate Polyline / Skia path; the gaps between segments are where
 * transit (bus, metro, cable car) was detected.
 *
 * Backward compatible: if no coordinate has a speed value, returns the original
 * array wrapped in a single-element array (no filtering applied).
 *
 * Segments with fewer than 2 points are discarded (can't form a visible line).
 */
export function splitByTransit(
  coords: Coordinate[],
  activityType: number,
): Coordinate[][] {
  const hasSpeed = coords.some((c) => c.speed !== undefined);
  if (!hasSpeed) return [coords];

  const maxSpeed = getTransitSpeedThreshold(activityType);
  const segments: Coordinate[][] = [];
  let current: Coordinate[] = [];

  for (const coord of coords) {
    if (coord.speed !== undefined && coord.speed > maxSpeed) {
      if (current.length >= 2) segments.push(current);
      current = [];
    } else {
      current.push(coord);
    }
  }
  if (current.length >= 2) segments.push(current);

  // If every point was transit (shouldn't happen in practice), return original
  return segments.length > 0 ? segments : [coords];
}
```

**Step 4: Run type check**

```bash
npx tsc --noEmit
```
Expected: no errors (speed is optional everywhere, no callers are broken).

**Step 5: Commit**

```bash
git add lib/geo.ts
git commit -m "feat: add Coordinate.speed field and splitByTransit utility"
```

---

### Task 2: Pass `loc.speed` through the import pipeline

**Files:**
- Modify: `hooks/use-import-trails.ts:93-105`

The import hook maps HealthKit route locations to `TimedCoordinate`. Currently only `latitude`, `longitude`, and `timestamp` are extracted. We need to add `speed`.

There are two code paths:
1. GPS filter enabled: `filterGpsOutliers(timedCoords)` — speed flows through automatically (JS preserves object fields, see Task 1 note).
2. GPS filter disabled: explicit destructure `{ latitude, longitude }` strips speed.

**Step 1: Update `timedCoords` mapping (line 93) to include speed**

Change lines 93–97 from:
```typescript
const timedCoords = routes[0].locations.map((loc) => ({
  latitude: loc.latitude,
  longitude: loc.longitude,
  timestamp: loc.date.getTime(),
}));
```
to:
```typescript
const timedCoords = routes[0].locations.map((loc) => ({
  latitude: loc.latitude,
  longitude: loc.longitude,
  timestamp: loc.date.getTime(),
  speed: loc.speed,
}));
```

**Step 2: Update the GPS-filter-disabled path (lines 102–105) to preserve speed**

Change:
```typescript
: timedCoords.map(({ latitude, longitude }) => ({
    latitude,
    longitude,
  }));
```
to:
```typescript
: timedCoords.map(({ latitude, longitude, speed }) => ({
    latitude,
    longitude,
    speed,
  }));
```

**Step 3: Run type check**

```bash
npx tsc --noEmit
```
Expected: no errors. `loc.speed` exists on `WorkoutRouteLocation` (confirmed in node_modules types).

**Step 4: Commit**

```bash
git add hooks/use-import-trails.ts
git commit -m "feat: store speed per coordinate during HealthKit import"
```

---

### Task 3: Apply transit splitting in stack view (`app/(tabs)/stack.tsx`)

**Files:**
- Modify: `app/(tabs)/stack.tsx:27` (import)
- Modify: `app/(tabs)/stack.tsx:273-282` (Polyline rendering block)

**Step 1: Add `splitByTransit` to the import from `@/lib/geo` (line 27)**

Change:
```typescript
import { smoothCoordinates, type Trail } from "@/lib/geo";
```
to:
```typescript
import { smoothCoordinates, splitByTransit, type Trail } from "@/lib/geo";
```

**Step 2: Replace the single-Polyline-per-trail block (lines 273–282)**

Change:
```tsx
{renderedTrails.map((trail) => (
  <Polyline
    key={trail.workoutId}
    coordinates={smoothCoordinates(trail.coordinates)}
    strokeColor={colors.trailStrokeStacked}
    strokeWidth={TRAIL_WIDTH}
    lineCap="round"
    lineJoin="round"
  />
))}
```
to:
```tsx
{renderedTrails.flatMap((trail) =>
  splitByTransit(trail.coordinates, trail.activityType).map((segment, i) => (
    <Polyline
      key={`${trail.workoutId}-${i}`}
      coordinates={smoothCoordinates(segment)}
      strokeColor={colors.trailStrokeStacked}
      strokeWidth={TRAIL_WIDTH}
      lineCap="round"
      lineJoin="round"
    />
  ))
)}
```

**Step 3: Run type check**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 4: Commit**

```bash
git add app/(tabs)/stack.tsx
git commit -m "feat: split transit segments in stack map view"
```

---

### Task 4: Apply transit splitting in trails tab (`app/(tabs)/trails.tsx`)

**Files:**
- Modify: `app/(tabs)/trails.tsx:26-27` (imports)
- Modify: `app/(tabs)/trails.tsx:93-97` (state declarations)
- Modify: `app/(tabs)/trails.tsx:162` (where coords are loaded)
- Modify: `app/(tabs)/trails.tsx:334-340` (Polyline rendering)

The trails tab shows one selected trail at a time. Currently `selectedCoords: Coordinate[]` is set directly from the DB. We need the activity type alongside coordinates to split correctly.

**Step 1: Add `splitByTransit` to the geo import (line 26)**

Change:
```typescript
import { smoothCoordinates } from "@/lib/geo";
import type { TrailSummary, Coordinate } from "@/lib/geo";
```
to:
```typescript
import { smoothCoordinates, splitByTransit } from "@/lib/geo";
import type { TrailSummary, Coordinate } from "@/lib/geo";
```

**Step 2: Replace `selectedCoords` state with `selectedSegments` (around line 97)**

Change:
```typescript
const [selectedCoords, setSelectedCoords] = useState<Coordinate[]>([]);
```
to:
```typescript
const [selectedSegments, setSelectedSegments] = useState<Coordinate[][]>([]);
```

**Step 3: Update the coord-loading effect (around line 162)**

The selected trail's `activityType` can be found from the `trails` array using `selectedId`.

Change:
```typescript
getTrailCoordinates(db, selectedId).then(setSelectedCoords);
```
to:
```typescript
const summary = trails.find((t) => t.workoutId === selectedId);
getTrailCoordinates(db, selectedId).then((coords) => {
  setSelectedSegments(splitByTransit(coords, summary?.activityType ?? 0));
});
```

**Step 4: Update all references to `selectedCoords` in the file**

Search for all remaining uses of `selectedCoords` and update:

- `fitToCoordinates` call (around line 167) needs a flat coord array:
  ```typescript
  // Change:
  mapRef.current?.fitToCoordinates(selectedCoords, { ... });
  // To:
  mapRef.current?.fitToCoordinates(selectedSegments.flat(), { ... });
  ```

- Guard checks `selectedCoords.length === 0` (around lines 166, 174):
  ```typescript
  // Change:
  if (!mapReady.current || selectedCoords.length === 0) return;
  if (selectedCoords.length === 0) return;
  // To:
  if (!mapReady.current || selectedSegments.length === 0) return;
  if (selectedSegments.length === 0) return;
  ```

- The `useEffect` dependency array referencing `selectedCoords` → `selectedSegments`.

**Step 5: Replace the Polyline block (around line 334)**

Change:
```tsx
{selectedCoords.length > 0 && (
  <Polyline
    coordinates={smoothCoordinates(selectedCoords)}
    strokeColor={colors.trailStroke}
    strokeWidth={3.5}
    lineCap="round"
    lineJoin="round"
  />
)}
```
to:
```tsx
{selectedSegments.flatMap((segment, i) => (
  <Polyline
    key={i}
    coordinates={smoothCoordinates(segment)}
    strokeColor={colors.trailStroke}
    strokeWidth={3.5}
    lineCap="round"
    lineJoin="round"
  />
))}
```

**Step 6: Run type check**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 7: Commit**

```bash
git add app/(tabs)/trails.tsx
git commit -m "feat: split transit segments in trails tab preview"
```

---

### Task 5: Apply transit splitting in the Skia poster renderer (`lib/poster-renderer.ts`)

**Files:**
- Modify: `lib/poster-renderer.ts` (import + `buildTrailPaths` function, around line 327)

**Step 1: Add `splitByTransit` to the import from `@/lib/geo`**

Find the existing import from `@/lib/geo` in `poster-renderer.ts` and add `splitByTransit`:
```typescript
// Find the line that imports from "@/lib/geo" and add splitByTransit to it
import { ..., splitByTransit } from "@/lib/geo";
```

**Step 2: Update `buildTrailPaths` to iterate over segments (around line 327)**

Change the inner loop from building one path per trail to building one path per segment:

```typescript
export function buildTrailPaths(
  trails: Trail[],
  transform: Transform,
): SkPath[] {
  const paths: SkPath[] = [];

  for (const trail of trails) {
    const segments = splitByTransit(trail.coordinates, trail.activityType);
    for (const segment of segments) {
      if (segment.length < 2) continue;

      const path = Skia.Path.Make();
      const first = transform.toCanvas(
        segment[0].latitude,
        segment[0].longitude,
      );
      path.moveTo(first.x, first.y);

      for (let i = 1; i < segment.length; i++) {
        const pt = transform.toCanvas(
          segment[i].latitude,
          segment[i].longitude,
        );
        path.lineTo(pt.x, pt.y);
      }

      paths.push(path);
    }
  }

  return paths;
}
```

**Step 3: Run type check**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 4: Commit**

```bash
git add lib/poster-renderer.ts
git commit -m "feat: split transit segments in Skia poster renderer"
```

---

### Task 6: Final verification

**Step 1: Full type check**
```bash
npx tsc --noEmit
```
Expected: zero errors.

**Step 2: Lint**
```bash
npx expo lint
```
Expected: no new warnings.

**Step 3: Manual test checklist (on device)**

*For newly imported trails (will have speed data):*
- [ ] Import a workout that was continued through public transport — verify the transit segment no longer appears on the stack view
- [ ] Select the same trail in the trails tab — verify the preview map shows the gap correctly
- [ ] Export a poster with the contaminated trail — verify the poster shows clean segments only

*For existing imported trails (no speed data, backward compat):*
- [ ] Open stack view with previously imported trails — verify all render identically to before
- [ ] No missing trails, no JavaScript errors in Metro console

*Performance sanity check:*
- [ ] Load 100+ trails in stack view — no noticeable frame drop vs. before

---

## Notes

- **Re-import required** to benefit from transit detection on existing data — this is the established pattern for import pipeline improvements in this codebase (see CLAUDE.md "Existing data requires re-import after adding simplification")
- **No schema migration needed** — coordinates are stored as JSON TEXT; adding an optional `speed` field to coordinate objects is transparently backward compatible
- **v2 improvement** (future): replace fixed threshold with stop-detect pattern (device stops, then reaches sustained vehicle speed) to eliminate the cycling/bus speed overlap. See `docs/plans/2026-02-21-transit-segment-detection-design.md` for details.
