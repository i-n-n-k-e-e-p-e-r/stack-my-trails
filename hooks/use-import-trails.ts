import { useState, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import {
  requestAuthorization,
  queryWorkoutSamples,
} from '@kingstinct/react-native-healthkit';
import { WorkoutActivityType } from '@kingstinct/react-native-healthkit/types';
import { computeBoundingBox, simplifyCoordinates } from '@/lib/geo';
import { upsertTrail } from '@/lib/db';

const ACTIVITY_TYPES = [
  WorkoutActivityType.running,
  WorkoutActivityType.walking,
  WorkoutActivityType.cycling,
  WorkoutActivityType.hiking,
];

interface UseImportTrailsResult {
  importing: boolean;
  progress: number;
  total: number;
  error: string | null;
  startImport: () => void;
}

export function useImportTrails(): UseImportTrailsResult {
  const db = useSQLiteContext();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const startImport = useCallback(async () => {
    if (importing) return;

    setImporting(true);
    setProgress(0);
    setTotal(0);
    setError(null);

    try {
      await requestAuthorization({
        toRead: ['HKWorkoutTypeIdentifier', 'HKWorkoutRouteTypeIdentifier'],
      });

      const workouts = await queryWorkoutSamples({
        limit: 0,
        ascending: false,
        filter: {
          OR: ACTIVITY_TYPES.map((type) => ({ workoutActivityType: type })),
        },
      });

      setTotal(workouts.length);

      for (let i = 0; i < workouts.length; i++) {
        const workout = workouts[i];
        setProgress(i + 1);

        try {
          const routes = await workout.getWorkoutRoutes();
          if (routes.length > 0 && routes[0].locations.length > 0) {
            const rawCoords = routes[0].locations.map((loc) => ({
              latitude: loc.latitude,
              longitude: loc.longitude,
            }));

            // Simplify coordinates to prevent OOM on map render
            const coordinates = simplifyCoordinates(rawCoords, 0.00005);

            // Extract weather metadata from BaseSample
            const temperature =
              workout.metadataWeatherTemperature?.quantity ?? null;
            const weatherCondition =
              workout.metadataWeatherCondition ?? null;

            await upsertTrail(db, {
              workoutId: workout.uuid,
              activityType: workout.workoutActivityType,
              startDate: workout.startDate.toISOString(),
              endDate: workout.endDate.toISOString(),
              duration: workout.duration.quantity,
              coordinates,
              boundingBox: computeBoundingBox(coordinates),
              temperature,
              weatherCondition,
            });
          }
        } catch {
          // Skip workouts where route fetch fails
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [db, importing]);

  return { importing, progress, total, error, startImport };
}
