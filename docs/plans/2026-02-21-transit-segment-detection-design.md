# Transit Segment Detection Design

**Date:** 2026-02-21
**Status:** Approved

## Problem

When a user forgets to stop their workout before boarding public transport (bus, metro, tram, cable car), the GPS continues recording. The trail stored in the app includes the vehicle route, which appears as visual noise on the stacked map — a bus line or metro corridor drawn alongside actual running/cycling paths.

Apple's Workout app handles this with dashed lines for "untrusted" segments. For a route visualization tool, even dashed lines are wrong — they don't represent any path the user actually traveled under their own power, so they shouldn't be drawn at all.

## Approach

Store the HealthKit-provided `speed` value (m/s) per coordinate point at import time. At render time, split the flat coordinate array into segments by dropping points that exceed an activity-appropriate speed threshold. Each valid segment becomes its own `Polyline`. Transit segments between them are simply not rendered — a clean gap.

This is a v1 approach. A more robust stop-detect algorithm (v2, future release) will handle edge cases like downhill cyclists where the threshold overlaps with transport speeds.

## Data Flow

```
HealthKit loc.speed
        ↓
TimedCoordinate { lat, lng, timestamp, speed }
        ↓
filterGpsOutliers()     ← speed passed through unchanged
        ↓
simplifyCoordinates()   ← Douglas-Peucker retains speed on kept points
        ↓
Coordinate[] { latitude, longitude, speed? }  ← stored as JSON in SQLite
        ↓
splitByTransit(coords, activityType)  ← render time
        ↓
Coordinate[][]  ← one Polyline / Skia path per segment
```

## Type Changes

```typescript
// lib/geo.ts

// Before
export interface Coordinate {
  latitude: number;
  longitude: number;
}

// After
export interface Coordinate {
  latitude: number;
  longitude: number;
  speed?: number; // m/s, from HealthKit CLLocation. undefined = legacy data, no filtering applied
}

// TimedCoordinate gains speed too (flows through GPS filter + simplification)
export interface TimedCoordinate extends Coordinate {
  timestamp: number;
  // speed?: number  ← inherited from Coordinate
}
```

## Speed Thresholds

| Activity | Type ID | Threshold | Reasoning |
|---|---|---|---|
| Running | 37 | 6 m/s (22 km/h) | Catches all transit; fast recreational sprint is ~5 m/s |
| Walking | 52 | 3 m/s (11 km/h) | Any vehicle speed caught |
| Hiking | 24 | 3 m/s (11 km/h) | Same as walking |
| Cycling | 13 | 12 m/s (43 km/h) | Catches trains; catches most city buses; mountain cable cars typically <40 km/h |
| Swimming | 46 | 3 m/s (11 km/h) | Not practically relevant but safe |
| Default | — | 8 m/s (29 km/h) | Conservative fallback for unknown types |

**Known v1 limitation for cycling:** City buses faster than 43 km/h will slip through. The stop-detect approach (v2) addresses this correctly without a fixed threshold.

## New Utility: `splitByTransit`

```typescript
// lib/geo.ts

export function splitByTransit(
  coords: Coordinate[],
  activityType: number
): Coordinate[][] {
  // If no speed data, return as single segment (backward compat)
  const hasSpeed = coords.some((c) => c.speed !== undefined);
  if (!hasSpeed) return [coords];

  const maxSpeed = getTransitSpeedThreshold(activityType);
  const segments: Coordinate[][] = [];
  let current: Coordinate[] = [];

  for (const coord of coords) {
    if (coord.speed !== undefined && coord.speed > maxSpeed) {
      // Transit point — close current segment if long enough
      if (current.length >= 2) segments.push(current);
      current = [];
    } else {
      current.push(coord);
    }
  }
  if (current.length >= 2) segments.push(current);

  // If all segments were filtered (shouldn't happen), return original
  return segments.length > 0 ? segments : [coords];
}

function getTransitSpeedThreshold(activityType: number): number {
  switch (activityType) {
    case 37: return 6;   // running
    case 52: return 3;   // walking
    case 24: return 3;   // hiking
    case 13: return 12;  // cycling
    case 46: return 3;   // swimming
    default: return 8;
  }
}
```

## Files Changed

### `lib/geo.ts`
- Add `speed?: number` to `Coordinate` interface
- Add `splitByTransit(coords, activityType)` function
- Add `getTransitSpeedThreshold(activityType)` helper

### `hooks/use-import-trails.ts`
- Add `speed: loc.speed` to the `timedCoords` mapping (one line change)

### `app/(tabs)/stack.tsx`
- Replace single `<Polyline>` per trail with `splitByTransit(trail.coordinates, trail.activityType)` segments
- Each segment renders as its own `<Polyline>` with a composite key `${trail.workoutId}-${i}`

### `app/(tabs)/index.tsx`
- Same treatment for the selected trail preview polyline on the trails tab

### `lib/poster-renderer.ts`
- In path-building step: call `splitByTransit` per trail, build one Skia path per segment
- Same blending/stroke logic applies to each segment path

## Backward Compatibility

- Old imported trails have no `speed` on coordinates — `splitByTransit` detects this (`hasSpeed` check) and returns the original array unchanged. No re-import required for old data to keep working.
- New imports will have speed data and benefit from transit detection immediately.
- Users who want to clean up existing contaminated trails can re-import (existing pattern per CLAUDE.md).

## Performance

- Only trails with transit contamination produce extra Polylines (typically 10–20% of trails).
- Splitting removes transit points, so total coordinate count rendered decreases for affected trails.
- Net effect: slightly lower GPU load on contaminated trails; negligible extra React Native bridge overhead for extra Polyline objects.
- Existing stack view cap (500 trails) and render-time re-simplification (>100 trails) continue to apply unchanged.

## Future Work (v2)

Replace fixed threshold with stop-detect pattern:
1. Find "stop events" — sequences where `speed < 1.5 m/s` for ≥ 3 consecutive points
2. Between two stop events, if median speed > 8 m/s and duration > 20s → transit segment
3. This eliminates the cycling/bus overlap problem without activity-specific thresholds
4. Handles the mountain biking use case (downhill doesn't start from a stop with sustained vehicle speed)
