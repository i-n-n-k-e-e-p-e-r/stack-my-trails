import type { SQLiteDatabase } from "expo-sqlite";
import { digestStringAsync, CryptoDigestAlgorithm } from "expo-crypto";
import { File as ExpoFile, Paths } from "expo-file-system";
import type { Coordinate, BoundingBox } from "./geo";

const APP_ID = "stack-my-trails";
const FORMAT_VERSION = 1;
const HMAC_KEY = "smt_2026_k8xPqR3vLm7nW9jY";

// ---------------------------------------------------------------------------
// File format
// ---------------------------------------------------------------------------

interface TrailRecord {
  workoutId: string;
  activityType: number;
  startDate: string;
  endDate: string;
  duration: number;
  coordinates: Coordinate[];
  boundingBox: BoundingBox;
  temperature?: number | null;
  weatherCondition?: number | null;
  locationLabel?: string | null;
  locationCountry?: string | null;
  locationRegion?: string | null;
  locationCity?: string | null;
}

interface ExportFile {
  version: number;
  appId: string;
  exportedAt: string;
  trailCount: number;
  trails: TrailRecord[];
  signature: string;
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

async function sign(data: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, HMAC_KEY + data);
}

async function verify(data: string, signature: string): Promise<boolean> {
  const expected = await sign(data);
  return expected === signature;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

interface FullTrailRow {
  workout_id: string;
  activity_type: number;
  start_date: string;
  end_date: string;
  duration: number;
  coordinates: string;
  bbox_min_lat: number;
  bbox_max_lat: number;
  bbox_min_lng: number;
  bbox_max_lng: number;
  temperature: number | null;
  weather_condition: number | null;
  location_label: string | null;
  location_country: string | null;
  location_region: string | null;
  location_city: string | null;
}

/**
 * Export all trails from the database to a signed JSON file.
 * Returns the local file URI ready for sharing.
 */
export async function exportTrailData(db: SQLiteDatabase): Promise<string> {
  const rows = await db.getAllAsync<FullTrailRow>(
    "SELECT * FROM trails ORDER BY start_date DESC",
  );

  const trails: TrailRecord[] = rows.map((row) => ({
    workoutId: row.workout_id,
    activityType: row.activity_type,
    startDate: row.start_date,
    endDate: row.end_date,
    duration: row.duration,
    coordinates: JSON.parse(row.coordinates) as Coordinate[],
    boundingBox: {
      minLat: row.bbox_min_lat,
      maxLat: row.bbox_max_lat,
      minLng: row.bbox_min_lng,
      maxLng: row.bbox_max_lng,
    },
    temperature: row.temperature,
    weatherCondition: row.weather_condition,
    locationLabel: row.location_label,
    locationCountry: row.location_country,
    locationRegion: row.location_region,
    locationCity: row.location_city,
  }));

  const trailsJson = JSON.stringify(trails);
  const signature = await sign(trailsJson);

  const exportData: ExportFile = {
    version: FORMAT_VERSION,
    appId: APP_ID,
    exportedAt: new Date().toISOString(),
    trailCount: trails.length,
    trails,
    signature,
  };

  const file = new ExpoFile(Paths.cache, `stack-my-trails-${Date.now()}.json`);
  file.write(JSON.stringify(exportData));
  return file.uri;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
}

/**
 * Import trail data from a signed .smtrails file.
 * Verifies signature, validates structure, merges into DB (skip existing).
 */
export async function importTrailData(
  db: SQLiteDatabase,
  fileUri: string,
): Promise<ImportResult> {
  const file = new ExpoFile(fileUri);
  if (!file.exists) {
    throw new Error("File not found");
  }

  const raw = await file.text();
  let data: ExportFile;
  try {
    data = JSON.parse(raw) as ExportFile;
  } catch {
    throw new Error("Invalid file format — not valid JSON");
  }

  // Validate structure
  if (data.appId !== APP_ID) {
    throw new Error("This file was not created by Stack My Trails");
  }
  if (data.version !== FORMAT_VERSION) {
    throw new Error(`Unsupported file version: ${data.version}`);
  }
  if (!Array.isArray(data.trails)) {
    throw new Error("Invalid file — no trail data found");
  }

  // Verify signature
  const trailsJson = JSON.stringify(data.trails);
  const valid = await verify(trailsJson, data.signature);
  if (!valid) {
    throw new Error(
      "Signature verification failed — file may be corrupted or tampered with",
    );
  }

  // Validate each trail minimally
  for (const trail of data.trails) {
    if (!trail.workoutId || !trail.startDate || !trail.endDate) {
      throw new Error("Invalid trail record — missing required fields");
    }
    if (!Array.isArray(trail.coordinates) || trail.coordinates.length === 0) {
      throw new Error(`Invalid trail ${trail.workoutId} — missing coordinates`);
    }
  }

  // Merge into DB — INSERT OR IGNORE skips existing workout IDs
  let imported = 0;
  let skipped = 0;

  for (const trail of data.trails) {
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO trails
        (workout_id, activity_type, start_date, end_date, duration, coordinates,
         bbox_min_lat, bbox_max_lat, bbox_min_lng, bbox_max_lng,
         temperature, weather_condition, location_label,
         location_country, location_region, location_city, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      trail.workoutId,
      trail.activityType,
      trail.startDate,
      trail.endDate,
      trail.duration,
      JSON.stringify(trail.coordinates),
      trail.boundingBox.minLat,
      trail.boundingBox.maxLat,
      trail.boundingBox.minLng,
      trail.boundingBox.maxLng,
      trail.temperature ?? null,
      trail.weatherCondition ?? null,
      trail.locationLabel ?? null,
      trail.locationCountry ?? null,
      trail.locationRegion ?? null,
      trail.locationCity ?? null,
      new Date().toISOString(),
    );

    if (result.changes > 0) {
      imported++;
    } else {
      skipped++;
    }
  }

  return { imported, skipped, total: data.trails.length };
}
