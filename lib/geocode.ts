import * as Location from 'expo-location';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getCachedLabel, setCachedLabel } from './db';
import type { Coordinate } from './geo';

export async function resolveLocation(
  db: SQLiteDatabase,
  center: Coordinate,
): Promise<{ country: string; region: string; city: string; label: string }> {
  const cached = await getCachedLabel(db, center.latitude, center.longitude);
  if (cached) {
    const parts = cached.split('|');
    if (parts.length === 4) {
      return { country: parts[0], region: parts[1], city: parts[2], label: parts[3] };
    }
  }

  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: center.latitude,
      longitude: center.longitude,
    });
    if (results.length > 0) {
      const addr = results[0];
      const country = addr.country || 'Unknown';
      const region = addr.region || 'Unknown';
      const city = addr.city || addr.district || 'Unknown';

      // Build display label (existing dedup logic for trail list display)
      const raw = [addr.district, addr.city, addr.region]
        .filter((v): v is string => !!v && v !== 'null');
      const labelParts = raw.filter(
        (v, i, a) =>
          a.indexOf(v) === i &&
          !a.some((other, j) => j !== i && v !== other && v.startsWith(other)),
      );
      const label = labelParts.length > 0 ? labelParts.join(', ') : addr.name || 'Unknown';

      await setCachedLabel(db, center.latitude, center.longitude, `${country}|${region}|${city}|${label}`);
      return { country, region, city, label };
    }
  } catch {}

  const fallback = `${center.latitude.toFixed(1)}, ${center.longitude.toFixed(1)}`;
  return { country: 'Unknown', region: 'Unknown', city: fallback, label: fallback };
}

export async function resolveLabel(
  db: SQLiteDatabase,
  center: Coordinate,
): Promise<string> {
  const loc = await resolveLocation(db, center);
  return loc.label;
}
