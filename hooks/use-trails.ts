import { useState, useEffect, useCallback } from "react";
import { useSQLiteContext } from "expo-sqlite";
import {
  getTrailSummaries,
  getTrailSummariesByLabels,
  getTrailsByIds,
} from "@/lib/db";
import {
  clusterTrails,
  computeBoundingBox,
  simplifyCoordinates,
  type TrailCluster,
  type Trail,
} from "@/lib/geo";

const MAX_RENDERED_TRAILS = 1000;
/** Re-simplify with coarser tolerance when many trails are stacked */
const RESIMPLIFY_THRESHOLD = 100;
const COARSE_TOLERANCE = 0.0002;

interface UseTrailsOptions {
  startDate: Date;
  endDate: Date;
  labels?: string[] | null;
  activityTypes?: number[] | null;
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
  labels,
  activityTypes,
}: UseTrailsOptions): UseTrailsResult {
  const db = useSQLiteContext();
  const [clusters, setClusters] = useState<TrailCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const labelsKey = labels ? labels.join("\0") : "";
  const activityKey = activityTypes ? activityTypes.join(",") : "";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const summaries = labels
          ? labels.length > 0
            ? await getTrailSummariesByLabels(db, startDate, endDate, labels, activityTypes)
            : [] // Empty labels array = no trails (no area selected)
          : await getTrailSummaries(db, startDate, endDate, activityTypes);
        if (cancelled) return;

        if (labels && labels.length > 0) {
          // When labels are provided, put all matching trails in one cluster
          const bboxCoords = summaries.flatMap((s) => [
            { latitude: s.boundingBox.minLat, longitude: s.boundingBox.minLng },
            { latitude: s.boundingBox.maxLat, longitude: s.boundingBox.maxLng },
          ]);
          const bbox =
            bboxCoords.length > 0
              ? computeBoundingBox(bboxCoords)
              : { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
          const cluster: TrailCluster = {
            id: "filtered",
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
          setError(e instanceof Error ? e.message : "Failed to load trails");
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
  }, [db, startDate.getTime(), endDate.getTime(), labelsKey, activityKey, refreshKey]);

  const loadClusterTrails = useCallback(
    async (cluster: TrailCluster): Promise<Trail[]> => {
      const ids = cluster.trailIds.slice(0, MAX_RENDERED_TRAILS);
      const trails = await getTrailsByIds(db, ids);
      // Re-simplify with coarser tolerance when rendering many trails
      if (trails.length > RESIMPLIFY_THRESHOLD) {
        for (const t of trails) {
          t.coordinates = simplifyCoordinates(t.coordinates, COARSE_TOLERANCE);
        }
      }
      return trails;
    },
    [db],
  );

  return { clusters, loading, error, loadClusterTrails, refresh };
}
