export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Chaikin's corner-cutting: replaces each segment with two points at 25%/75%,
 * producing smooth curves. One iteration roughly doubles point count.
 */
export function smoothCoordinates(
  coords: Coordinate[],
  iterations = 1,
): Coordinate[] {
  if (coords.length < 3) return coords;

  let result = coords;
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: Coordinate[] = [result[0]];
    for (let i = 0; i < result.length - 1; i++) {
      const p0 = result[i];
      const p1 = result[i + 1];
      smoothed.push({
        latitude: p0.latitude * 0.75 + p1.latitude * 0.25,
        longitude: p0.longitude * 0.75 + p1.longitude * 0.25,
      });
      smoothed.push({
        latitude: p0.latitude * 0.25 + p1.latitude * 0.75,
        longitude: p0.longitude * 0.25 + p1.longitude * 0.75,
      });
    }
    smoothed.push(result[result.length - 1]);
    result = smoothed;
  }
  return result;
}

export function computeBoundingBox(coordinates: Coordinate[]): BoundingBox {
  let minLat = Infinity,
    maxLat = -Infinity;
  let minLng = Infinity,
    maxLng = -Infinity;

  for (const coord of coordinates) {
    minLat = Math.min(minLat, coord.latitude);
    maxLat = Math.max(maxLat, coord.latitude);
    minLng = Math.min(minLng, coord.longitude);
    maxLng = Math.max(maxLng, coord.longitude);
  }

  return { minLat, maxLat, minLng, maxLng };
}

export function bboxCenter(bbox: BoundingBox): Coordinate {
  return {
    latitude: (bbox.minLat + bbox.maxLat) / 2,
    longitude: (bbox.minLng + bbox.maxLng) / 2,
  };
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface TimedCoordinate extends Coordinate {
  timestamp: number;
}

/**
 * Remove GPS outliers caused by spoofing/jamming.
 * Uses timestamps for speed-based filtering — physically impossible speeds
 * between consecutive points indicate spoofed data.
 *
 * 1. Speed filter: skip points requiring impossible speed from the last good point
 * 2. Median filter: remove remaining points far from the trail center
 */
export function filterGpsOutliers(coords: TimedCoordinate[]): Coordinate[] {
  if (coords.length < 5) return coords;

  // Stage 1: adaptive speed filter
  // Compute median speed from all consecutive pairs
  const speeds: number[] = [];
  for (let i = 1; i < coords.length; i++) {
    const dtH = (coords[i].timestamp - coords[i - 1].timestamp) / 3_600_000;
    if (dtH <= 0) continue;
    const dist = haversineKm(
      coords[i - 1].latitude,
      coords[i - 1].longitude,
      coords[i].latitude,
      coords[i].longitude,
    );
    speeds.push(dist / dtH);
  }

  const sortedSpeeds = [...speeds].sort((a, b) => a - b);
  const medianSpeed = sortedSpeeds[Math.floor(sortedSpeeds.length / 2)] || 5;
  // Allow 5× median speed (generous for turns, hills) but at least 15 km/h
  const maxSpeed = Math.max(medianSpeed * 5, 15);

  // Forward pass: keep a point only if it's reachable at maxSpeed from the
  // last accepted point
  let filtered: Coordinate[] = [coords[0]];
  let lastGood = coords[0];
  for (let i = 1; i < coords.length; i++) {
    const dtH = (coords[i].timestamp - lastGood.timestamp) / 3_600_000;
    if (dtH <= 0) continue;
    const dist = haversineKm(
      lastGood.latitude,
      lastGood.longitude,
      coords[i].latitude,
      coords[i].longitude,
    );
    if (dist / dtH <= maxSpeed) {
      filtered.push(coords[i]);
      lastGood = coords[i];
    }
  }

  // Stage 2: iterative median filter to clean remaining drift
  for (let pass = 0; pass < 3; pass++) {
    if (filtered.length < 10) break;
    const lats = filtered.map((c) => c.latitude).sort((a, b) => a - b);
    const lngs = filtered.map((c) => c.longitude).sort((a, b) => a - b);
    const medLat = lats[Math.floor(lats.length / 2)];
    const medLng = lngs[Math.floor(lngs.length / 2)];

    const distances = filtered.map((c) =>
      haversineKm(c.latitude, c.longitude, medLat, medLng),
    );
    const sorted = [...distances].sort((a, b) => a - b);
    const medianDist = sorted[Math.floor(sorted.length / 2)];
    const threshold = Math.max(medianDist * 3, 0.3);

    const next = filtered.filter((_, i) => distances[i] <= threshold);
    if (next.length === filtered.length || next.length < 5) break;
    filtered = next;
  }

  return filtered;
}

/** Douglas-Peucker line simplification. Reduces coordinate count by 80-90%. */
export function simplifyCoordinates(
  coords: Coordinate[],
  tolerance: number = 0.00005,
): Coordinate[] {
  if (coords.length <= 2) return coords;

  function perpDist(pt: Coordinate, a: Coordinate, b: Coordinate): number {
    const dx = b.longitude - a.longitude;
    const dy = b.latitude - a.latitude;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      return Math.sqrt(
        (pt.latitude - a.latitude) ** 2 + (pt.longitude - a.longitude) ** 2,
      );
    }
    const t = Math.max(
      0,
      Math.min(
        1,
        ((pt.longitude - a.longitude) * dx + (pt.latitude - a.latitude) * dy) /
          lenSq,
      ),
    );
    return Math.sqrt(
      (pt.latitude - (a.latitude + t * dy)) ** 2 +
        (pt.longitude - (a.longitude + t * dx)) ** 2,
    );
  }

  function simplify(segment: Coordinate[]): Coordinate[] {
    if (segment.length <= 2) return segment;

    let maxDist = 0;
    let maxIdx = 0;
    const first = segment[0];
    const last = segment[segment.length - 1];

    for (let i = 1; i < segment.length - 1; i++) {
      const d = perpDist(segment[i], first, last);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }

    if (maxDist > tolerance) {
      const left = simplify(segment.slice(0, maxIdx + 1));
      const right = simplify(segment.slice(maxIdx));
      return left.slice(0, -1).concat(right);
    }

    return [first, last];
  }

  return simplify(coords);
}

/** Trail metadata without coordinates — cheap to load for lists and clustering. */
export interface TrailSummary {
  workoutId: string;
  activityType: number;
  startDate: string;
  endDate: string;
  duration: number;
  boundingBox: BoundingBox;
  temperature?: number | null;
  weatherCondition?: number | null;
  locationLabel?: string | null;
  locationCountry?: string | null;
  locationRegion?: string | null;
  locationCity?: string | null;
}

/** Full trail with coordinates — only load when needed for map display. */
export interface Trail extends TrailSummary {
  coordinates: Coordinate[];
}

export interface TrailCluster {
  id: string;
  trailIds: string[];
  summaries: TrailSummary[];
  boundingBox: BoundingBox;
  label?: string;
}

export interface ClusterGroup {
  id: string;
  clusters: TrailCluster[];
  boundingBox: BoundingBox;
  totalCount: number;
}

/**
 * Groups clusters by proximity using centroid-seeded grouping.
 * Unlike union-find, this prevents chaining distant areas through intermediates.
 * The largest ungrouped cluster seeds each group; others join if within maxDistKm
 * of that seed's center.
 */
export function groupClustersByProximity(
  clusters: TrailCluster[],
  maxDistKm: number = 20,
): ClusterGroup[] {
  if (clusters.length === 0) return [];

  // Sort by size (most trails first) — largest seeds the group
  const sorted = [...clusters].sort(
    (a, b) => b.summaries.length - a.summaries.length,
  );
  const assigned = new Set<number>();
  const result: ClusterGroup[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (assigned.has(i)) continue;

    // Seed a new group with this cluster's center
    const seedCenter = bboxCenter(sorted[i].boundingBox);
    const group: TrailCluster[] = [sorted[i]];
    assigned.add(i);

    // Pull in all unassigned clusters within maxDistKm of the seed center
    for (let j = i + 1; j < sorted.length; j++) {
      if (assigned.has(j)) continue;
      const jCenter = bboxCenter(sorted[j].boundingBox);
      if (
        haversineKm(
          seedCenter.latitude,
          seedCenter.longitude,
          jCenter.latitude,
          jCenter.longitude,
        ) <= maxDistKm
      ) {
        group.push(sorted[j]);
        assigned.add(j);
      }
    }

    const unionBbox: BoundingBox = {
      minLat: Math.min(...group.map((c) => c.boundingBox.minLat)),
      maxLat: Math.max(...group.map((c) => c.boundingBox.maxLat)),
      minLng: Math.min(...group.map((c) => c.boundingBox.minLng)),
      maxLng: Math.max(...group.map((c) => c.boundingBox.maxLng)),
    };

    result.push({
      id: group[0].id,
      clusters: group,
      boundingBox: unionBbox,
      totalCount: group.reduce((sum, c) => sum + c.summaries.length, 0),
    });
  }

  result.sort((a, b) => b.totalCount - a.totalCount);
  return result;
}

/** Clusters trail summaries by geographic proximity. No coordinates needed. */
export function clusterTrails(
  trails: TrailSummary[],
  maxDistanceKm: number = 5,
): TrailCluster[] {
  const n = trails.length;
  if (n === 0) return [];

  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(a: number, b: number) {
    parent[find(a)] = find(b);
  }

  for (let i = 0; i < n; i++) {
    const ci = bboxCenter(trails[i].boundingBox);
    for (let j = i + 1; j < n; j++) {
      const cj = bboxCenter(trails[j].boundingBox);
      if (
        haversineKm(ci.latitude, ci.longitude, cj.latitude, cj.longitude) <=
        maxDistanceKm
      ) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, TrailSummary[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(trails[i]);
  }

  const clusters: TrailCluster[] = [];
  for (const [, groupTrails] of groups) {
    const unionBbox: BoundingBox = {
      minLat: Math.min(...groupTrails.map((t) => t.boundingBox.minLat)),
      maxLat: Math.max(...groupTrails.map((t) => t.boundingBox.maxLat)),
      minLng: Math.min(...groupTrails.map((t) => t.boundingBox.minLng)),
      maxLng: Math.max(...groupTrails.map((t) => t.boundingBox.maxLng)),
    };

    clusters.push({
      id: groupTrails[0].workoutId,
      trailIds: groupTrails.map((t) => t.workoutId),
      summaries: groupTrails,
      boundingBox: unionBbox,
    });
  }

  // Most popular area first
  clusters.sort((a, b) => b.summaries.length - a.summaries.length);

  return clusters;
}
