# Structured Labels: Country + City

## Problem

The current `location_label` column stores a freeform string (e.g. "Neve Sha'anan, Haifa") built by joining geocoder fields. The filter modal re-parses these strings by splitting on commas to group areas. Rename/drag-drop features let users change labels, but new imports create fresh labels from geocoding, causing inconsistency.

## Solution

Replace `location_label` with two structured columns: `location_country` and `location_city`, populated directly from `addr.country` and `addr.city` geocoder fields.

## Schema Changes (v8)

Add to trails table:
- `location_country TEXT` — from `addr.country` (e.g. "Israel", "Belarus")
- `location_city TEXT` — from `addr.city` (e.g. "Haifa", "Minsk")

Migration: add columns with ALTER TABLE. Existing trails keep NULL in new columns until re-import. Old `location_label` column left in place (not dropped) but unused going forward.

## Geocoding Changes (`lib/geocode.ts`)

New function:
```ts
resolveLocation(db, center) → { country: string; city: string }
```

Uses `addr.country` + `addr.city` from expo-location. Cache updated to store both fields. Old `resolveLabel()` can remain for trail list display or be rebuilt from country+city.

## Filter Modal Simplification

Remove:
- `renameTrailLabel()` / `renameTrailLabel` DB function
- All rename UI (Alert.prompt handlers)
- All drag-drop/move UI (dragSource state, handleStartDrag, handleDropOnGroup, handleDropToRoot)
- All merge confirmation dialogs
- `extractCity()` / `extractLocality()` / `buildAreaGroups()` string parsing

Replace with:
- Two-level list built from `SELECT DISTINCT location_country, location_city FROM trails`
- Country row (top level): selects all cities in that country
- City row (sub level): selects just that city
- No editing, no reordering

## Filter Store Changes

Replace:
```ts
areaLabels: string[] | null
areaLabel: string | null
```

With:
```ts
country: string | null
city: string | null
```

## DB Query Changes

Replace `getTrailSummariesByLabels()` (matches on `location_label IN (...)`) with query that filters on `location_country = ?` and optionally `location_city = ?`.

## What Gets Removed

- ~200 lines of rename/drag-drop/merge UI from filter-modal.tsx
- `renameTrailLabel()` from db.ts
- Complex string parsing functions (extractCity, extractLocality, buildAreaGroups)
- SubArea/AreaGroup interfaces and related types

## What Gets Kept

- Date range filtering (presets + pickers)
- Activity type filtering
- Two-level expandable area list (now country → city instead of parsed strings)
- Apply button behavior
- Label cache table (updated schema)
