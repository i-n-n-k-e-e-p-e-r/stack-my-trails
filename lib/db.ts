import type { SQLiteDatabase } from 'expo-sqlite';
import type { Trail, TrailSummary, Coordinate } from './geo';

const SCHEMA_VERSION = 8;

export async function initDatabase(db: SQLiteDatabase) {
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
    await db
      .execAsync(`
      ALTER TABLE trails ADD COLUMN temperature REAL;
      ALTER TABLE trails ADD COLUMN weather_condition INTEGER;
    `)
      .catch(() => {});
  }

  if (currentVersion < 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  if (currentVersion < 4) {
    await db.execAsync(
      `DELETE FROM cluster_labels WHERE label LIKE '%null%'`,
    );
  }

  if (currentVersion < 5) {
    // Clear labels with duplicate segments (e.g., "Minsk, Minsk")
    await db.execAsync(`DELETE FROM cluster_labels`);
  }

  if (currentVersion < 6) {
    // Clear labels again — fixed prefix dedup (e.g., "Minsk, Minsk Region")
    await db.execAsync(`DELETE FROM cluster_labels`);
  }

  if (currentVersion < 7) {
    await db
      .execAsync(`ALTER TABLE trails ADD COLUMN location_label TEXT`)
      .catch(() => {});
  }

  if (currentVersion < 8) {
    await db
      .execAsync(`
      ALTER TABLE trails ADD COLUMN location_country TEXT;
      ALTER TABLE trails ADD COLUMN location_region TEXT;
      ALTER TABLE trails ADD COLUMN location_city TEXT;
    `)
      .catch(() => {});
  }

  if (currentVersion === 0) {
    await db.runAsync(
      'INSERT INTO schema_version (version) VALUES (?)',
      SCHEMA_VERSION,
    );
  } else if (currentVersion < SCHEMA_VERSION) {
    await db.runAsync('UPDATE schema_version SET version = ?', SCHEMA_VERSION);
  }
}

export async function upsertTrail(
  db: SQLiteDatabase,
  trail: Trail & {
    locationLabel?: string | null;
    locationCountry?: string | null;
    locationRegion?: string | null;
    locationCity?: string | null;
  },
) {
  await db.runAsync(
    `INSERT OR REPLACE INTO trails
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
}

// ---------- Summary queries (no coordinates — cheap) ----------

interface SummaryRow {
  workout_id: string;
  activity_type: number;
  start_date: string;
  end_date: string;
  duration: number;
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

const SUMMARY_COLS = `workout_id, activity_type, start_date, end_date, duration,
  bbox_min_lat, bbox_max_lat, bbox_min_lng, bbox_max_lng,
  temperature, weather_condition, location_label,
  location_country, location_region, location_city`;

function rowToSummary(row: SummaryRow): TrailSummary {
  return {
    workoutId: row.workout_id,
    activityType: row.activity_type,
    startDate: row.start_date,
    endDate: row.end_date,
    duration: row.duration,
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
  };
}

/** Load all trail metadata WITHOUT coordinates. Safe for any dataset size. */
export async function getAllTrailSummaries(
  db: SQLiteDatabase,
): Promise<TrailSummary[]> {
  const rows = await db.getAllAsync<SummaryRow>(
    `SELECT ${SUMMARY_COLS} FROM trails ORDER BY start_date DESC`,
  );
  return rows.map(rowToSummary);
}

/** Load trail summaries within a date range. */
export async function getTrailSummaries(
  db: SQLiteDatabase,
  startDate: Date,
  endDate: Date,
  activityTypes?: number[] | null,
): Promise<TrailSummary[]> {
  const params: (string | number)[] = [startDate.toISOString(), endDate.toISOString()];
  let query = `SELECT ${SUMMARY_COLS} FROM trails
     WHERE start_date >= ? AND start_date <= ?`;
  if (activityTypes && activityTypes.length > 0) {
    query += ` AND activity_type IN (${activityTypes.map(() => '?').join(',')})`;
    params.push(...activityTypes);
  }
  query += ` ORDER BY start_date DESC`;
  const rows = await db.getAllAsync<SummaryRow>(query, ...params);
  return rows.map(rowToSummary);
}

/** Load trail summaries by structured location within a date range. */
export async function getTrailSummariesByLocation(
  db: SQLiteDatabase,
  startDate: Date,
  endDate: Date,
  country: string,
  region?: string | null,
  city?: string | null,
  activityTypes?: number[] | null,
): Promise<TrailSummary[]> {
  const params: (string | number)[] = [startDate.toISOString(), endDate.toISOString(), country];
  let query = `SELECT ${SUMMARY_COLS} FROM trails
     WHERE start_date >= ? AND start_date <= ? AND location_country = ?`;
  if (region) {
    query += ` AND location_region = ?`;
    params.push(region);
  }
  if (city) {
    query += ` AND location_city = ?`;
    params.push(city);
  }
  if (activityTypes && activityTypes.length > 0) {
    query += ` AND activity_type IN (${activityTypes.map(() => '?').join(',')})`;
    params.push(...activityTypes);
  }
  query += ` ORDER BY start_date DESC`;
  const rows = await db.getAllAsync<SummaryRow>(query, ...params);
  return rows.map(rowToSummary);
}

/** Get distinct area combinations with trail counts, optionally filtered by date range and activity types. */
export async function getDistinctAreas(
  db: SQLiteDatabase,
  startDate?: Date,
  endDate?: Date,
  activityTypes?: number[] | null,
): Promise<{ country: string; region: string; city: string; count: number }[]> {
  const conditions = ['location_country IS NOT NULL'];
  const params: (string | number)[] = [];
  if (startDate && endDate) {
    conditions.push('start_date >= ? AND start_date <= ?');
    params.push(startDate.toISOString(), endDate.toISOString());
  }
  if (activityTypes && activityTypes.length > 0) {
    conditions.push(`activity_type IN (${activityTypes.map(() => '?').join(',')})`);
    params.push(...activityTypes);
  }
  return db.getAllAsync<{ country: string; region: string; city: string; count: number }>(
    `SELECT location_country as country, location_region as region, location_city as city, COUNT(*) as count
     FROM trails
     WHERE ${conditions.join(' AND ')}
     GROUP BY location_country, location_region, location_city
     ORDER BY count DESC`,
    ...params,
  );
}

/** Get the location of the most recent trail. */
export async function getLastTrailLocation(
  db: SQLiteDatabase,
): Promise<{ country: string; region: string; city: string } | null> {
  const row = await db.getFirstAsync<{
    location_country: string;
    location_region: string;
    location_city: string;
  }>(
    `SELECT location_country, location_region, location_city FROM trails
     WHERE location_country IS NOT NULL
     ORDER BY start_date DESC LIMIT 1`,
  );
  if (!row) return null;
  return { country: row.location_country, region: row.location_region, city: row.location_city };
}

// ---------- Coordinate queries (on demand) ----------

/** Load coordinates for a single trail. */
export async function getTrailCoordinates(
  db: SQLiteDatabase,
  workoutId: string,
): Promise<Coordinate[]> {
  const row = await db.getFirstAsync<{ coordinates: string }>(
    'SELECT coordinates FROM trails WHERE workout_id = ?',
    workoutId,
  );
  if (!row) return [];
  return JSON.parse(row.coordinates) as Coordinate[];
}

/** Load full trails (with coordinates) for a list of IDs. Use sparingly. */
export async function getTrailsByIds(
  db: SQLiteDatabase,
  workoutIds: string[],
): Promise<Trail[]> {
  if (workoutIds.length === 0) return [];

  // Batch in groups of 50 to stay safe with SQLite variable limits
  const results: Trail[] = [];
  for (let i = 0; i < workoutIds.length; i += 50) {
    const batch = workoutIds.slice(i, i + 50);
    const placeholders = batch.map(() => '?').join(',');
    const rows = await db.getAllAsync<SummaryRow & { coordinates: string }>(
      `SELECT * FROM trails WHERE workout_id IN (${placeholders})`,
      ...batch,
    );
    for (const row of rows) {
      results.push({
        ...rowToSummary(row),
        coordinates: JSON.parse(row.coordinates) as Coordinate[],
      });
    }
  }
  return results;
}

// ---------- Missing labels ----------

/** Get trails where geocoding failed (country='Unknown' or city looks like coordinates). */
export async function getTrailsWithMissingLabels(
  db: SQLiteDatabase,
): Promise<TrailSummary[]> {
  const rows = await db.getAllAsync<SummaryRow>(
    `SELECT ${SUMMARY_COLS} FROM trails
     WHERE location_country = 'Unknown'
        OR location_city GLOB '*[0-9]*.[0-9]*, *[0-9]*.[0-9]*'
     ORDER BY start_date DESC`,
  );
  return rows.map(rowToSummary);
}

/** Update just the location fields for a trail. */
export async function updateTrailLocation(
  db: SQLiteDatabase,
  workoutId: string,
  location: { country: string; region: string; city: string; label: string },
) {
  await db.runAsync(
    `UPDATE trails SET location_country = ?, location_region = ?, location_city = ?, location_label = ?
     WHERE workout_id = ?`,
    location.country,
    location.region,
    location.city,
    location.label,
    workoutId,
  );
}

// ---------- Delete ----------

export async function deleteAllTrails(db: SQLiteDatabase) {
  await db.execAsync('DELETE FROM trails');
  await db.execAsync('DELETE FROM cluster_labels');
}

// ---------- Stats ----------

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

export async function getLatestTrailDate(
  db: SQLiteDatabase,
): Promise<Date | null> {
  const result = await db.getFirstAsync<{ start_date: string }>(
    'SELECT start_date FROM trails ORDER BY start_date DESC LIMIT 1',
  );
  return result ? new Date(result.start_date) : null;
}

/** Get the min and max trail dates in the database */
export async function getTrailDateRange(
  db: SQLiteDatabase,
): Promise<{ minDate: Date; maxDate: Date } | null> {
  const result = await db.getFirstAsync<{ min_date: string; max_date: string }>(
    'SELECT MIN(start_date) as min_date, MAX(start_date) as max_date FROM trails',
  );
  if (!result || !result.min_date || !result.max_date) return null;
  return {
    minDate: new Date(result.min_date),
    maxDate: new Date(result.max_date),
  };
}

// ---------- Settings ----------

export async function getSetting(
  db: SQLiteDatabase,
  key: string,
): Promise<string | null> {
  const result = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return result?.value ?? null;
}

export async function setSetting(
  db: SQLiteDatabase,
  key: string,
  value: string,
) {
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    key,
    value,
  );
}

// ---------- Label cache ----------

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
