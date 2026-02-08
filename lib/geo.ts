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

export interface Trail {
  workoutId: string;
  activityType: number;
  startDate: string;
  endDate: string;
  duration: number;
  coordinates: Coordinate[];
  boundingBox: BoundingBox;
}

export interface TrailCluster {
  id: string;
  trails: Trail[];
  boundingBox: BoundingBox;
  label?: string;
}

export function clusterTrails(
  trails: Trail[],
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

  const groups = new Map<number, Trail[]>();
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
      trails: groupTrails,
      boundingBox: unionBbox,
    });
  }

  // Most popular area first
  clusters.sort((a, b) => b.trails.length - a.trails.length);

  return clusters;
}
