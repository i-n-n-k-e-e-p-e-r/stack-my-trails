import { useState, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getTrailsWithMissingLabels, updateTrailLocation, getTrailCoordinates } from '@/lib/db';
import { resolveLocation } from '@/lib/geocode';
import { computeBoundingBox, bboxCenter } from '@/lib/geo';

interface UseUpdateLabelsResult {
  updating: boolean;
  progress: number;
  total: number;
  failedCount: number;
  fixedCount: number;
  startUpdate: () => void;
}

export function useUpdateLabels(): UseUpdateLabelsResult {
  const db = useSQLiteContext();
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [fixedCount, setFixedCount] = useState(0);

  const startUpdate = useCallback(async () => {
    if (updating) return;

    setUpdating(true);
    setProgress(0);
    setTotal(0);
    setFailedCount(0);
    setFixedCount(0);

    try {
      const trails = await getTrailsWithMissingLabels(db);
      setTotal(trails.length);

      let failed = 0;
      let fixed = 0;

      for (let i = 0; i < trails.length; i++) {
        setProgress(i + 1);
        const trail = trails[i];

        const coordinates = await getTrailCoordinates(db, trail.workoutId);
        if (coordinates.length < 2) {
          failed++;
          continue;
        }

        const bbox = computeBoundingBox(coordinates);
        const location = await resolveLocation(db, bboxCenter(bbox));

        if (location.failed) {
          failed++;
        } else {
          await updateTrailLocation(db, trail.workoutId, location);
          fixed++;
        }
      }

      setFailedCount(failed);
      setFixedCount(fixed);
    } finally {
      setUpdating(false);
    }
  }, [db, updating]);

  return { updating, progress, total, failedCount, fixedCount, startUpdate };
}
