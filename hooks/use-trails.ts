import { useState, useEffect, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getTrailSummaries, getTrailsByIds } from '@/lib/db';
import { clusterTrails, type TrailCluster, type Trail } from '@/lib/geo';

const MAX_RENDERED_TRAILS = 50;

interface UseTrailsOptions {
  startDate: Date;
  endDate: Date;
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
}: UseTrailsOptions): UseTrailsResult {
  const db = useSQLiteContext();
  const [clusters, setClusters] = useState<TrailCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Load summaries only — no coordinates, very fast
        const summaries = await getTrailSummaries(db, startDate, endDate);
        if (cancelled) return;

        const result = clusterTrails(summaries);
        setClusters(result);
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
  }, [db, startDate.getTime(), endDate.getTime(), refreshKey]);

  const loadClusterTrails = useCallback(
    async (cluster: TrailCluster): Promise<Trail[]> => {
      // Only load coordinates for up to MAX_RENDERED_TRAILS
      const ids = cluster.trailIds.slice(0, MAX_RENDERED_TRAILS);
      return getTrailsByIds(db, ids);
    },
    [db],
  );

  return { clusters, loading, error, loadClusterTrails, refresh };
}
