# Structured Labels Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace freeform `location_label` with structured `location_country` + `location_region` + `location_city` columns, simplify filter modal by removing rename/drag-drop/merge, use 3-level accordion (country→region→city).

**Architecture:** Three new DB columns populated from geocoder's `addr.country`, `addr.region`, `addr.city`. Filter modal becomes a 3-level accordion. Filter store passes `country`/`region`/`city` strings instead of label arrays. Selecting a country includes all regions+cities; selecting a region includes all cities in that region.

**Tech Stack:** expo-sqlite, expo-location, React Native, TypeScript

---

### Task 1: Schema migration + new DB columns

**Files:**
- Modify: `lib/db.ts`

**Step 1: Add schema v8 migration**

In `initDatabase()`, add after the v7 block:

```ts
if (currentVersion < 8) {
  await db
    .execAsync(`
      ALTER TABLE trails ADD COLUMN location_country TEXT;
      ALTER TABLE trails ADD COLUMN location_region TEXT;
      ALTER TABLE trails ADD COLUMN location_city TEXT;
    `)
    .catch(() => {});
}
```

Update `SCHEMA_VERSION` from `7` to `8`.

**Step 2: Update `SummaryRow` and `SUMMARY_COLS`**

Add `location_country`, `location_region`, and `location_city` to the `SummaryRow` interface and `SUMMARY_COLS` string.

**Step 3: Update `rowToSummary`**

Add to the returned object:
```ts
locationCountry: row.location_country,
locationRegion: row.location_region,
locationCity: row.location_city,
```

**Step 4: Update `upsertTrail`**

Add `location_country`, `location_region`, `location_city` columns to the INSERT statement and bind them from `trail.locationCountry`, `trail.locationRegion`, `trail.locationCity`.

**Step 5: Add new query function**

```ts
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
```

**Step 6: Add area listing query**

```ts
export async function getDistinctAreas(
  db: SQLiteDatabase,
): Promise<{ country: string; region: string; city: string; count: number }[]> {
  return db.getAllAsync<{ country: string; region: string; city: string; count: number }>(
    `SELECT location_country as country, location_region as region, location_city as city, COUNT(*) as count
     FROM trails
     WHERE location_country IS NOT NULL
     GROUP BY location_country, location_region, location_city
     ORDER BY count DESC`,
  );
}
```

**Step 7: Remove `renameTrailLabel()`**

Delete the function entirely.

**Step 8: Commit**

```
feat: add location_country/region/city columns (schema v8)
```

---

### Task 2: Update geocoding + TrailSummary type

**Files:**
- Modify: `lib/geocode.ts`
- Modify: `lib/geo.ts` (TrailSummary interface)

**Step 1: Add fields to TrailSummary**

In `lib/geo.ts`, update the interface:

```ts
export interface TrailSummary {
  workoutId: string;
  activityType: number;
  startDate: string;
  endDate: string;
  duration: number;
  boundingBox: BoundingBox;
  temperature?: number | null;
  weatherCondition?: number | null;
  locationLabel?: string | null;
  locationCountry?: string | null;
  locationRegion?: string | null;
  locationCity?: string | null;
}
```

**Step 2: Add `resolveLocation()` to geocode.ts**

```ts
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

      // Build display label (existing logic for trail list display)
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
```

**Step 3: Update `resolveLabel()` to use `resolveLocation()` internally**

```ts
export async function resolveLabel(
  db: SQLiteDatabase,
  center: Coordinate,
): Promise<string> {
  const loc = await resolveLocation(db, center);
  return loc.label;
}
```

**Step 4: Commit**

```
feat: add resolveLocation() with structured country/region/city
```

---

### Task 3: Update import hook

**Files:**
- Modify: `hooks/use-import-trails.ts`

**Step 1: Import `resolveLocation` instead of `resolveLabel`**

```ts
import { resolveLocation } from '@/lib/geocode';
```

**Step 2: Update the import loop**

Replace:
```ts
const locationLabel = await resolveLabel(db, bboxCenter(boundingBox));
```

With:
```ts
const location = await resolveLocation(db, bboxCenter(boundingBox));
```

And update the `upsertTrail` call:
```ts
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
```

**Step 3: Commit**

```
feat: populate country/region/city on trail import
```

---

### Task 4: Update filter store

**Files:**
- Modify: `lib/filter-store.ts`

**Step 1: Replace FilterState fields**

```ts
export interface FilterState {
  startDate: Date;
  endDate: Date;
  country: string | null;
  region: string | null;
  city: string | null;
  activityTypes: number[] | null;
}
```

**Step 2: Update `defaultState()`**

```ts
function defaultState(): FilterState {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  return { startDate: start, endDate: end, country: null, region: null, city: null, activityTypes: null };
}
```

**Step 3: Update `hasActiveFilters()`**

```ts
export function hasActiveFilters(): boolean {
  return _state.country !== null;
}
```

**Step 4: Commit**

```
refactor: simplify filter store to country/region/city
```

---

### Task 5: Update use-trails hook

**Files:**
- Modify: `hooks/use-trails.ts`

**Step 1: Change options interface**

Replace `labels?: string[] | null` with:
```ts
country?: string | null;
region?: string | null;
city?: string | null;
```

**Step 2: Update imports**

Replace `getTrailSummariesByLabels` with `getTrailSummariesByLocation`.

**Step 3: Update the load function**

Replace the labels-based logic with:
```ts
const summaries = country
  ? await getTrailSummariesByLocation(db, startDate, endDate, country, region, city, activityTypes)
  : await getTrailSummaries(db, startDate, endDate, activityTypes);
```

Keep the single-cluster wrapping logic for filtered results (replace `labels && labels.length > 0` check with `country` check).

**Step 4: Update deps key**

Replace `labelsKey` with:
```ts
const locationKey = `${country ?? ''}\0${region ?? ''}\0${city ?? ''}`;
```

And replace `labelsKey` in the useEffect deps with `locationKey`.

**Step 5: Commit**

```
refactor: use-trails accepts country/region/city instead of labels
```

---

### Task 6: Update stack screen

**Files:**
- Modify: `app/(tabs)/stack.tsx`

**Step 1: Update filter destructuring**

Replace:
```ts
const { startDate, endDate, areaLabels: filterLabels, areaLabel, activityTypes } = filters;
```
With:
```ts
const { startDate, endDate, country, region, city, activityTypes } = filters;
```

**Step 2: Build display label**

```ts
const displayLabel = country
  ? [city, region, country].filter(Boolean).join(', ')
  : '';
```

**Step 3: Update useTrails call**

```ts
const { clusters, loading, loadClusterTrails } = useTrails({
  startDate,
  endDate,
  country,
  region,
  city,
  activityTypes,
});
```

**Step 4: Update top bar label**

Replace `areaLabel ?? t("stack.selectArea")` with:
```ts
{displayLabel || t("stack.selectArea")}
```

**Step 5: Update export data call**

Replace:
```ts
setExportData(renderedTrails, areaLabel ?? "", mapRegion, heading);
```
With:
```ts
setExportData(renderedTrails, displayLabel, mapRegion, heading);
```

**Step 6: Commit**

```
refactor: stack screen uses country/region/city filters
```

---

### Task 7: Rewrite filter modal

**Files:**
- Modify: `app/filter-modal.tsx`

This is the largest task. Replace the entire area section with a 3-level country→region→city accordion.

**Step 1: Remove unused imports and functions**

Remove from the file:
- `renameTrailLabel`, `getAllTrailSummaries` imports from db
- `extractCity()`, `extractLocality()`, `buildAreaGroups()` functions
- `SubArea`, `AreaGroup` interfaces
- `TrailSummary` type import
- `Feather` import (check if still needed — remove if no usages remain after cleanup)
- `Alert` from react-native imports

**Step 2: Replace area data loading**

Remove `allSummaries` state and the `useMemo` for `areaGroups`. Replace with:

```ts
const [areas, setAreas] = useState<{ country: string; region: string; city: string; count: number }[]>([]);

useEffect(() => {
  let cancelled = false;
  async function loadAreas() {
    const result = await getDistinctAreas(db);
    if (!cancelled) {
      setAreas(result);
      setLoadingAreas(false);
    }
  }
  loadAreas();
  return () => { cancelled = true; };
}, [db]);
```

Import `getDistinctAreas` from db.

**Step 3: Build 3-level groups from areas**

```ts
interface CityEntry { city: string; count: number }
interface RegionGroup { region: string; cities: CityEntry[]; totalCount: number }
interface CountryGroup { country: string; regions: RegionGroup[]; totalCount: number }

const countryGroups = useMemo((): CountryGroup[] => {
  const countryMap = new Map<string, Map<string, CityEntry[]>>();
  for (const a of areas) {
    if (!countryMap.has(a.country)) countryMap.set(a.country, new Map());
    const regionMap = countryMap.get(a.country)!;
    if (!regionMap.has(a.region)) regionMap.set(a.region, []);
    regionMap.get(a.region)!.push({ city: a.city, count: a.count });
  }

  const result: CountryGroup[] = [];
  for (const [country, regionMap] of countryMap) {
    const regions: RegionGroup[] = [];
    for (const [region, cities] of regionMap) {
      const sorted = cities.sort((a, b) => b.count - a.count);
      regions.push({
        region,
        cities: sorted,
        totalCount: sorted.reduce((s, c) => s + c.count, 0),
      });
    }
    regions.sort((a, b) => b.totalCount - a.totalCount);
    result.push({
      country,
      regions,
      totalCount: regions.reduce((s, r) => s + r.totalCount, 0),
    });
  }
  return result.sort((a, b) => b.totalCount - a.totalCount);
}, [areas]);
```

**Step 4: Replace selection state**

Remove `selectedLabels`, `selectedDisplayLabel`. Replace with:

```ts
const [selectedCountry, setSelectedCountry] = useState<string | null>(
  currentFilters.country,
);
const [selectedRegion, setSelectedRegion] = useState<string | null>(
  currentFilters.region,
);
const [selectedCity, setSelectedCity] = useState<string | null>(
  currentFilters.city,
);
```

**Step 5: Expand state for two levels**

Replace `expandedGroups` (single Set) with two sets:

```ts
const [expandedCountries, setExpandedCountries] = useState<Set<number>>(new Set());
const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
```

Region keys use `"countryIdx-regionIdx"` string for uniqueness.

```ts
const toggleCountry = (idx: number) => {
  setExpandedCountries((prev) => {
    const next = new Set(prev);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    return next;
  });
};

const toggleRegion = (key: string) => {
  setExpandedRegions((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
};
```

**Step 6: Remove all drag/rename state and handlers**

Delete: `dragSource` state, `handleStartDrag`, `handleDropOnGroup`, `handleDropToRoot`, `handleRenameLabel`, `handleRenameGroup`, `doRename`, `reloadAreas`, `labelsMatch`.

**Step 7: Selection helpers**

```ts
const selectCountry = (country: string) => {
  setSelectedCountry(country);
  setSelectedRegion(null);
  setSelectedCity(null);
};

const selectRegion = (country: string, region: string) => {
  setSelectedCountry(country);
  setSelectedRegion(region);
  setSelectedCity(null);
};

const selectCity = (country: string, region: string, city: string) => {
  setSelectedCountry(country);
  setSelectedRegion(region);
  setSelectedCity(city);
};
```

**Step 8: Update handleApply**

```ts
const handleApply = () => {
  setFilters({
    startDate,
    endDate,
    country: selectedCountry,
    region: selectedRegion,
    city: selectedCity,
    activityTypes: selectedActivities.length > 0 ? selectedActivities : null,
  });
  router.back();
};
```

Apply button enabled when `selectedCountry !== null`:
```ts
disabled={selectedCountry === null}
opacity: selectedCountry === null ? 0.4 : 1,
```

**Step 9: Rewrite area list JSX**

Replace the entire area rendering block (from the drag banner through the areaGroups.map) with the 3-level accordion. Each level uses radio buttons for selection:

- **Country row:** radio (filled if country selected with no region/city), bold text, chevron, count pill. Tap = select country + toggle expand.
- **Region row:** indented (paddingLeft: 40), radio (filled if this region selected with no city), medium text, chevron, count pill. Tap = select region + toggle expand.
- **City row:** double-indented (paddingLeft: 64), small radio, regular text, count pill. Tap = select city.

For countries with only 1 region that has only 1 city, render as a flat row showing `"City, Region, Country"` with no expand.

For countries with 1 region but multiple cities, skip the region level and show cities directly under the country.

```tsx
{loadingAreas ? (
  <View style={styles.areaLoading}>
    <ActivityIndicator size="small" color={colors.accent} />
    <Text style={[styles.areaLoadingText, { color: colors.textSecondary }]}>
      {t("filter.loadingAreas")}
    </Text>
  </View>
) : countryGroups.length === 0 ? (
  <View style={styles.areaLoading}>
    <Text style={[styles.areaLoadingText, { color: colors.textSecondary }]}>
      {t("filter.noAreasMatch")}
    </Text>
  </View>
) : (
  <View style={[styles.areaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    {countryGroups.map((cGroup, cIdx) => {
      const isLastCountry = cIdx === countryGroups.length - 1;
      const countryExpanded = expandedCountries.has(cIdx);
      const isCountrySelected = selectedCountry === cGroup.country && !selectedRegion && !selectedCity;
      const isSingleFlat = cGroup.regions.length === 1 && cGroup.regions[0].cities.length === 1;

      // Flat row for single-region, single-city countries
      if (isSingleFlat) {
        const r = cGroup.regions[0];
        const c = r.cities[0];
        const isActive = selectedCountry === cGroup.country;
        return (
          <TouchableOpacity
            key={cIdx}
            style={[
              styles.areaRow,
              !isLastCountry && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
            ]}
            onPress={() => selectCity(cGroup.country, r.region, c.city)}
          >
            <View style={[styles.radio, {
              borderColor: isActive ? colors.accent : colors.textSecondary,
              backgroundColor: isActive ? colors.accent : "transparent",
            }]} />
            <Text style={[styles.areaLabel, { color: colors.text }]} numberOfLines={1}>
              {c.city}, {r.region}
            </Text>
            <View style={[styles.countPill, { borderColor: colors.border, borderWidth: 1 }]}>
              <Text style={[styles.countPillText, { color: colors.text }]}>{c.count}</Text>
            </View>
          </TouchableOpacity>
        );
      }

      const singleRegion = cGroup.regions.length === 1;

      return (
        <View key={cIdx}>
          {/* Country row */}
          <TouchableOpacity
            style={[
              styles.areaRow,
              !countryExpanded && !isLastCountry && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
            ]}
            onPress={() => {
              selectCountry(cGroup.country);
              toggleCountry(cIdx);
            }}
          >
            <View style={[styles.radio, {
              borderColor: isCountrySelected ? colors.accent : colors.textSecondary,
              backgroundColor: isCountrySelected ? colors.accent : "transparent",
            }]} />
            <Text style={[styles.areaLabel, { color: colors.text, fontFamily: Fonts.medium }]} numberOfLines={1}>
              {cGroup.country}
            </Text>
            <Text style={[styles.chevron, { color: colors.textSecondary }]}>
              {countryExpanded ? "\u25B4" : "\u25BE"}
            </Text>
            <View style={[styles.countPill, { borderColor: colors.border, borderWidth: 1 }]}>
              <Text style={[styles.countPillText, { color: colors.text }]}>{cGroup.totalCount}</Text>
            </View>
          </TouchableOpacity>

          {/* Regions (or cities directly if single region) */}
          {countryExpanded && (singleRegion ? (
            // Single region: show cities directly under country
            cGroup.regions[0].cities.map((city, cityIdx) => {
              const citySelected = selectedCountry === cGroup.country && selectedCity === city.city;
              const isLastCity = cityIdx === cGroup.regions[0].cities.length - 1 && isLastCountry;
              return (
                <TouchableOpacity
                  key={cityIdx}
                  style={[
                    styles.areaRow, styles.subAreaRow,
                    !isLastCity && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
                  ]}
                  onPress={() => selectCity(cGroup.country, cGroup.regions[0].region, city.city)}
                >
                  <View style={[styles.radioSmall, {
                    borderColor: citySelected ? colors.accent : colors.textSecondary,
                    backgroundColor: citySelected ? colors.accent : "transparent",
                  }]} />
                  <Text style={[styles.areaLabel, { color: colors.text }]} numberOfLines={1}>
                    {city.city}
                  </Text>
                  <View style={[styles.countPill, { borderColor: colors.border, borderWidth: 1 }]}>
                    <Text style={[styles.countPillText, { color: colors.text }]}>{city.count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            // Multiple regions
            cGroup.regions.map((rGroup, rIdx) => {
              const regionKey = `${cIdx}-${rIdx}`;
              const regionExpanded = expandedRegions.has(regionKey);
              const isRegionSelected = selectedCountry === cGroup.country && selectedRegion === rGroup.region && !selectedCity;
              const isLastRegion = rIdx === cGroup.regions.length - 1;
              const singleCity = rGroup.cities.length === 1;

              // Region with single city: flat row
              if (singleCity) {
                const c = rGroup.cities[0];
                const isActive = selectedCountry === cGroup.country && selectedRegion === rGroup.region;
                return (
                  <TouchableOpacity
                    key={rIdx}
                    style={[
                      styles.areaRow, styles.subAreaRow,
                      !(isLastRegion && isLastCountry) && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
                    ]}
                    onPress={() => selectCity(cGroup.country, rGroup.region, c.city)}
                  >
                    <View style={[styles.radioSmall, {
                      borderColor: isActive ? colors.accent : colors.textSecondary,
                      backgroundColor: isActive ? colors.accent : "transparent",
                    }]} />
                    <Text style={[styles.areaLabel, { color: colors.text }]} numberOfLines={1}>
                      {c.city}, {rGroup.region}
                    </Text>
                    <View style={[styles.countPill, { borderColor: colors.border, borderWidth: 1 }]}>
                      <Text style={[styles.countPillText, { color: colors.text }]}>{c.count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }

              return (
                <View key={rIdx}>
                  {/* Region row */}
                  <TouchableOpacity
                    style={[
                      styles.areaRow, styles.subAreaRow,
                      !regionExpanded && !(isLastRegion && isLastCountry) && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
                    ]}
                    onPress={() => {
                      selectRegion(cGroup.country, rGroup.region);
                      toggleRegion(regionKey);
                    }}
                  >
                    <View style={[styles.radioSmall, {
                      borderColor: isRegionSelected ? colors.accent : colors.textSecondary,
                      backgroundColor: isRegionSelected ? colors.accent : "transparent",
                    }]} />
                    <Text style={[styles.areaLabel, { color: colors.text, fontFamily: Fonts.medium }]} numberOfLines={1}>
                      {rGroup.region}
                    </Text>
                    <Text style={[styles.chevron, { color: colors.textSecondary }]}>
                      {regionExpanded ? "\u25B4" : "\u25BE"}
                    </Text>
                    <View style={[styles.countPill, { borderColor: colors.border, borderWidth: 1 }]}>
                      <Text style={[styles.countPillText, { color: colors.text }]}>{rGroup.totalCount}</Text>
                    </View>
                  </TouchableOpacity>

                  {/* City rows */}
                  {regionExpanded && rGroup.cities.map((city, cityIdx) => {
                    const citySelected = selectedCountry === cGroup.country && selectedRegion === rGroup.region && selectedCity === city.city;
                    const isLastCity = cityIdx === rGroup.cities.length - 1 && isLastRegion && isLastCountry;
                    return (
                      <TouchableOpacity
                        key={cityIdx}
                        style={[
                          styles.areaRow, styles.subSubAreaRow,
                          !isLastCity && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
                        ]}
                        onPress={() => selectCity(cGroup.country, rGroup.region, city.city)}
                      >
                        <View style={[styles.radioSmall, {
                          borderColor: citySelected ? colors.accent : colors.textSecondary,
                          backgroundColor: citySelected ? colors.accent : "transparent",
                        }]} />
                        <Text style={[styles.areaLabel, { color: colors.text }]} numberOfLines={1}>
                          {city.city}
                        </Text>
                        <View style={[styles.countPill, { borderColor: colors.border, borderWidth: 1 }]}>
                          <Text style={[styles.countPillText, { color: colors.text }]}>{city.count}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })
          ))}
        </View>
      );
    })}
  </View>
)}
```

**Step 10: Add new style**

```ts
subSubAreaRow: {
  paddingLeft: 64,
},
```

**Step 11: Remove unused styles**

Delete: `editButton`, `dragBannerWrap`, `dragBanner`, `dragBannerText`, `dropRootZone`, `dropRootText`.

**Step 12: Auto-expand to current selection on load**

```ts
useEffect(() => {
  if (loadingAreas || !selectedCountry) return;
  for (let i = 0; i < countryGroups.length; i++) {
    if (countryGroups[i].country === selectedCountry) {
      setExpandedCountries(new Set([i]));
      if (selectedRegion) {
        for (let j = 0; j < countryGroups[i].regions.length; j++) {
          if (countryGroups[i].regions[j].region === selectedRegion) {
            setExpandedRegions(new Set([`${i}-${j}`]));
            break;
          }
        }
      }
      break;
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [loadingAreas]);
```

**Step 13: Remove unused imports**

Remove `Alert` from react-native imports. Remove `renameTrailLabel` and `getAllTrailSummaries` from db imports. Remove `TrailSummary` type import. Check if `Feather` is still used — remove if not.

**Step 14: Commit**

```
refactor: simplify filter modal — 3-level country/region/city accordion
```

---

### Task 8: Clean up old code + type check

**Files:**
- Modify: `lib/db.ts` — remove dead functions
- All files — fix type errors

**Step 1: Remove dead DB functions**

Delete `getTrailSummariesByLabel()`, `getTrailSummariesByLabels()`, and `renameTrailLabel()`.

**Step 2: Run type check**

```bash
npx tsc --noEmit
```

Fix any type errors from FilterState changes propagating through the codebase.

**Step 3: Run lint**

```bash
npx expo lint
```

Fix any warnings.

**Step 4: Commit**

```
chore: remove dead label code, fix types
```

---

### Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Update sections:
- Schema description (v8, three new columns)
- Filter modal description (3-level country→region→city accordion, no rename/drag)
- Filter store (country/region/city instead of areaLabels)
- Geocoding (resolveLocation returns structured data)
- Remove all mentions of rename/drag/merge/reorder
- Remove label inconsistency from Known Issues

**Step 1: Commit**

```
docs: update CLAUDE.md for structured labels
```
