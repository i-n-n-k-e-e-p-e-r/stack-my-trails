import type { SQLiteDatabase } from 'expo-sqlite';
import type { Trail, Coordinate } from './geo';

export async function initDatabase(db: SQLiteDatabase) {
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

export async function upsertTrail(db: SQLiteDatabase, trail: Trail) {
  await db.runAsync(
    `INSERT OR REPLACE INTO trails
      (workout_id, activity_type, start_date, end_date, duration, coordinates,
       bbox_min_lat, bbox_max_lat, bbox_min_lng, bbox_max_lng, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  return rows.map((row) => ({
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
  }));
}

export async function getTrailCount(db: SQLiteDatabase): Promise<number> {
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM trails',
  );
  return result?.count ?? 0;
}

export async function getCachedLabel(
  db: SQLiteDatabase,
  lat: number,
  lng: number,
): Promise<string | null> {
  // Round to 1 decimal for cache key (same area ~11km)
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
