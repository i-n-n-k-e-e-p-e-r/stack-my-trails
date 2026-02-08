import type { SQLiteDatabase } from 'expo-sqlite';
import type { Trail, Coordinate } from './geo';

const SCHEMA_VERSION = 2;

export async function initDatabase(db: SQLiteDatabase) {
  // Create version tracking table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
  `);

  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_version LIMIT 1',
  );
  const currentVersion = row?.version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS trails (
        workout_id TEXT PRIMARY KEY,
        activity_type INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        duration REAL NOT NULL,
        coordinates TEXT NOT NULL,
        bbox_min_lat REAL NOT NULL,
        bbox_max_lat REAL NOT NULL,
        bbox_min_lng REAL NOT NULL,
        bbox_max_lng REAL NOT NULL,
        imported_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trails_start_date ON trails(start_date);

      CREATE TABLE IF NOT EXISTS cluster_labels (
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        label TEXT NOT NULL,
        PRIMARY KEY (lat, lng)
      );
    `);
  }

  if (currentVersion < 2) {
    // Add weather columns
    await db.execAsync(`
      ALTER TABLE trails ADD COLUMN temperature REAL;
      ALTER TABLE trails ADD COLUMN weather_condition INTEGER;
    `).catch(() => {
      // Columns may already exist if migration was partially applied
    });
  }

  // Update version
  if (currentVersion === 0) {
    await db.runAsync(
      'INSERT INTO schema_version (version) VALUES (?)',
      SCHEMA_VERSION,
    );
  } else if (currentVersion < SCHEMA_VERSION) {
    await db.runAsync('UPDATE schema_version SET version = ?', SCHEMA_VERSION);
  }
}

export async function upsertTrail(db: SQLiteDatabase, trail: Trail) {
  await db.runAsync(
    `INSERT OR REPLACE INTO trails
      (workout_id, activity_type, start_date, end_date, duration, coordinates,
       bbox_min_lat, bbox_max_lat, bbox_min_lng, bbox_max_lng,
       temperature, weather_condition, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    new Date().toISOString(),
  );
}

interface TrailRow {
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
}

function rowToTrail(row: TrailRow): Trail {
  return {
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
  };
}

export async function getTrails(
  db: SQLiteDatabase,
  startDate: Date,
  endDate: Date,
): Promise<Trail[]> {
  const rows = await db.getAllAsync<TrailRow>(
    `SELECT * FROM trails
     WHERE start_date >= ? AND start_date <= ?
     ORDER BY start_date DESC`,
    startDate.toISOString(),
    endDate.toISOString(),
  );
  return rows.map(rowToTrail);
}

export async function getAllTrails(db: SQLiteDatabase): Promise<Trail[]> {
  const rows = await db.getAllAsync<TrailRow>(
    'SELECT * FROM trails ORDER BY start_date DESC',
  );
  return rows.map(rowToTrail);
}

export async function getTrailCount(db: SQLiteDatabase): Promise<number> {
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM trails',
  );
  return result?.count ?? 0;
}

export async function getLastImportDate(
  db: SQLiteDatabase,
): Promise<string | null> {
  const result = await db.getFirstAsync<{ imported_at: string }>(
    'SELECT imported_at FROM trails ORDER BY imported_at DESC LIMIT 1',
  );
  return result?.imported_at ?? null;
}

export async function getCachedLabel(
  db: SQLiteDatabase,
  lat: number,
  lng: number,
): Promise<string | null> {
  const roundedLat = Math.round(lat * 10) / 10;
  const roundedLng = Math.round(lng * 10) / 10;
  const result = await db.getFirstAsync<{ label: string }>(
    'SELECT label FROM cluster_labels WHERE lat = ? AND lng = ?',
    roundedLat,
    roundedLng,
  );
  return result?.label ?? null;
}

export async function setCachedLabel(
  db: SQLiteDatabase,
  lat: number,
  lng: number,
  label: string,
) {
  const roundedLat = Math.round(lat * 10) / 10;
  const roundedLng = Math.round(lng * 10) / 10;
  await db.runAsync(
    'INSERT OR REPLACE INTO cluster_labels (lat, lng, label) VALUES (?, ?, ?)',
    roundedLat,
    roundedLng,
    label,
  );
}
