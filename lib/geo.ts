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

/** Douglas-Peucker line simplification. Reduces coordinate count by 80-90%. */
export function simplifyCoordinates(
  coords: Coordinate[],
  tolerance: number = 0.00005,
): Coordinate[] {
  if (coords.length <= 2) return coords;

  function perpDist(
    pt: Coordinate,
    a: Coordinate,
    b: Coordinate,
  ): number {
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
  for (const [_, groupTrails] of groups) {
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
