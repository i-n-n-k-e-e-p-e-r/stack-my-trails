import { useState, useEffect, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getTrails } from '@/lib/db';
import { clusterTrails, type TrailCluster } from '@/lib/geo';

interface UseTrailsOptions {
  startDate: Date;
  endDate: Date;
}

interface UseTrailsResult {
  clusters: TrailCluster[];
  loading: boolean;
  error: string | null;
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
        const trails = await getTrails(db, startDate, endDate);
        if (cancelled) return;

        const result = clusterTrails(trails);
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

  return { clusters, loading, error, refresh };
}
