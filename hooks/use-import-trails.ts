import { useState, useCallback, useRef } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import {
  requestAuthorization,
  queryWorkoutSamples,
} from '@kingstinct/react-native-healthkit';
import { WorkoutActivityType } from '@kingstinct/react-native-healthkit/types';
import { computeBoundingBox, filterGpsOutliers, simplifyCoordinates, bboxCenter, type TimedCoordinate } from '@/lib/geo';
import { upsertTrail, getSetting } from '@/lib/db';
import { resolveLocation } from '@/lib/geocode';

const ACTIVITY_TYPES = [
  WorkoutActivityType.running,
  WorkoutActivityType.walking,
  WorkoutActivityType.cycling,
  WorkoutActivityType.hiking,
  WorkoutActivityType.swimming,
];

interface UseImportTrailsResult {
  importing: boolean;
  progress: number;
  total: number;
  error: string | null;
  failedLabels: number;
  cancelled: boolean;
  startImport: (since?: Date | null) => void;
  cancelImport: () => void;
}

export function useImportTrails(): UseImportTrailsResult {
  const db = useSQLiteContext();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [failedLabels, setFailedLabels] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const cancelRef = useRef(false);

  const cancelImport = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const startImport = useCallback(async (since?: Date | null) => {
    if (importing) return;

    setImporting(true);
    setProgress(0);
    setTotal(0);
    setError(null);
    setFailedLabels(0);
    setCancelled(false);
    cancelRef.current = false;
    let labelFailCount = 0;

    try {
      const gpsFilterSetting = await getSetting(db, "gpsFilter").catch(() => null);
      const useGpsFilter = gpsFilterSetting !== "false";

      await requestAuthorization({
        toRead: ['HKWorkoutTypeIdentifier', 'HKWorkoutRouteTypeIdentifier'],
      });

      const workouts = await queryWorkoutSamples({
        limit: 0,
        ascending: false,
        filter: {
          ...(since ? { date: { startDate: since } } : {}),
          OR: ACTIVITY_TYPES.map((type) => ({ workoutActivityType: type })),
        },
      });

      setTotal(workouts.length);

      for (let i = 0; i < workouts.length; i++) {
        if (cancelRef.current) break;

        const workout = workouts[i];
        setProgress(i + 1);

        try {
          const routes = await workout.getWorkoutRoutes();
          if (routes.length > 0 && routes[0].locations.length > 0) {
            const timedCoords = routes[0].locations.map((loc) => ({
              latitude: loc.latitude,
              longitude: loc.longitude,
              timestamp: loc.date.getTime(),
            }));

            // Remove GPS spoofing outliers (if enabled), then simplify
            const cleaned = useGpsFilter
              ? filterGpsOutliers(timedCoords)
              : timedCoords.map(({ latitude, longitude }) => ({ latitude, longitude }));
            if (cleaned.length < 2) continue;
            const coordinates = simplifyCoordinates(cleaned, 0.00005);

            // Extract weather metadata from BaseSample
            const temperature =
              workout.metadataWeatherTemperature?.quantity ?? null;
            const weatherCondition =
              workout.metadataWeatherCondition ?? null;

            const boundingBox = computeBoundingBox(coordinates);
            const location = await resolveLocation(
              db,
              bboxCenter(boundingBox),
            );
            if (location.failed) labelFailCount++;

            await upsertTrail(db, {
              workoutId: workout.uuid,
              activityType: workout.workoutActivityType,
              startDate: workout.startDate.toISOString(),
              endDate: workout.endDate.toISOString(),
              duration: workout.duration.quantity,
              coordinates,
              boundingBox,
              temperature,
              weatherCondition,
              locationLabel: location.label,
              locationCountry: location.country,
              locationRegion: location.region,
              locationCity: location.city,
            });
          }
        } catch {
          // Skip workouts where route fetch fails
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setFailedLabels(labelFailCount);
      setCancelled(cancelRef.current);
      setImporting(false);
    }
  }, [db, importing]);

  return { importing, progress, total, error, failedLabels, cancelled, startImport, cancelImport };
}
