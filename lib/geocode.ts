import * as Location from 'expo-location';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getCachedLabel, setCachedLabel } from './db';
import type { Coordinate } from './geo';

export async function resolveLabel(
  db: SQLiteDatabase,
  center: Coordinate,
): Promise<string> {
  const cached = await getCachedLabel(db, center.latitude, center.longitude);
  if (cached) return cached;

  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: center.latitude,
      longitude: center.longitude,
    });
    if (results.length > 0) {
      const addr = results[0];
      const raw = [addr.district, addr.city, addr.region]
        .filter((v): v is string => !!v && v !== 'null');
      // Deduplicate exact matches AND drop "Minsk Region" when "Minsk" exists
      const parts = raw.filter(
        (v, i, a) =>
          a.indexOf(v) === i &&
          !a.some((other, j) => j !== i && v !== other && v.startsWith(other)),
      );
      const label =
        parts.length > 0 ? parts.join(', ') : addr.name || 'Unknown';
      await setCachedLabel(db, center.latitude, center.longitude, label);
      return label;
    }
  } catch {}

  return `${center.latitude.toFixed(1)}, ${center.longitude.toFixed(1)}`;
}
