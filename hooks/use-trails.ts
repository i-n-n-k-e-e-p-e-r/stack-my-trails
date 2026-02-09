import { useState, useEffect, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import {
  getTrailSummaries,
  getTrailSummariesInArea,
  getTrailsByIds,
} from '@/lib/db';
import {
  clusterTrails,
  type BoundingBox,
  type TrailCluster,
  type Trail,
} from '@/lib/geo';

const MAX_RENDERED_TRAILS = 50;

interface UseTrailsOptions {
  startDate: Date;
  endDate: Date;
  bbox?: BoundingBox | null;
}

interface UseTrailsResult {
  clusters: TrailCluster[];
  loading: boolean;
  error: string | null;
  /** Load full trail data (with coordinates) for a cluster. Capped at 50. */
  loadClusterTrails: (cluster: TrailCluster) => Promise<Trail[]>;
  refresh: () => void;
}

export function useTrails({
  startDate,
  endDate,
  bbox,
}: UseTrailsOptions): UseTrailsResult {
  const db = useSQLiteContext();
  const [clusters, setClusters] = useState<TrailCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const bboxKey = bbox
    ? `${bbox.minLat},${bbox.maxLat},${bbox.minLng},${bbox.maxLng}`
    : '';

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const summaries = bbox
          ? await getTrailSummariesInArea(db, startDate, endDate, bbox)
          : await getTrailSummaries(db, startDate, endDate);
        if (cancelled) return;

        if (bbox) {
          // When bbox is provided, put all matching trails in one cluster
          const cluster: TrailCluster = {
            id: 'filtered',
            trailIds: summaries.map((s) => s.workoutId),
            summaries,
            boundingBox: bbox,
          };
          setClusters(summaries.length > 0 ? [cluster] : []);
        } else {
          setClusters(clusterTrails(summaries));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load trails');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, startDate.getTime(), endDate.getTime(), bboxKey, refreshKey]);

  const loadClusterTrails = useCallback(
    async (cluster: TrailCluster): Promise<Trail[]> => {
      const ids = cluster.trailIds.slice(0, MAX_RENDERED_TRAILS);
      return getTrailsByIds(db, ids);
    },
    [db],
  );

  return { clusters, loading, error, loadClusterTrails, refresh };
}
