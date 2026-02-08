# Stacked Trails v1 - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first working version of the app — read workout routes from Apple Health and display them stacked on an Apple Maps view, with area selection and date filtering.

**Architecture:** Two-tab Expo Router app. "Map" tab shows stacked workout polylines on Apple Maps. "Settings" tab (future, not in v1) left as placeholder. Data flows: HealthKit -> query workouts -> fetch routes -> cluster by geography -> user picks area -> render polylines. All state managed with React hooks (no external state library needed yet).

**Tech Stack:** Expo 54, React Native 0.81, `@kingstinct/react-native-healthkit` v13, `react-native-maps` (Apple Maps), TypeScript.

---

## Task 1: Install dependencies and configure native plugins

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `app.json` (add plugins)

**Step 1: Install packages**

Run:
```bash
npx expo install @kingstinct/react-native-healthkit react-native-maps react-native-nitro-modules
```

**Step 2: Add Expo config plugins to `app.json`**

Add to the `plugins` array in `app.json`:
```json
["@kingstinct/react-native-healthkit", {
  "NSHealthShareUsageDescription": "Stack My Trails reads your workout routes to visualize them on the map",
  "NSHealthUpdateUsageDescription": false,
  "background": false
}],
"react-native-maps"
```

**Step 3: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "feat: add healthkit and maps dependencies"
```

> **Note:** After this task, the user must run `npx expo run:ios` to rebuild the native app with the new modules. Pods will be installed automatically.

---

## Task 2: Clean up default template — set up app skeleton

Replace the default Expo template screens with our app structure. Single tab for now (Map), remove the Explore tab and default content.

**Files:**
- Rewrite: `app/(tabs)/index.tsx` — becomes the Map screen
- Rewrite: `app/(tabs)/_layout.tsx` — single "Map" tab
- Delete: `app/(tabs)/explore.tsx`
- Delete: `app/modal.tsx`
- Modify: `app/_layout.tsx` — remove modal route

**Step 1: Rewrite `app/(tabs)/_layout.tsx`**

```tsx
import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: colorScheme === 'dark'
            ? 'rgba(21, 23, 24, 0.85)'
            : 'rgba(255, 255, 255, 0.85)',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="map.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

**Step 2: Rewrite `app/(tabs)/index.tsx`** to a placeholder Map screen

```tsx
import { StyleSheet, View, Text } from 'react-native';

export default function MapScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Map Screen - Coming Soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 18,
    opacity: 0.5,
  },
});
```

**Step 3: Remove `app/_layout.tsx` modal route**

Remove the modal `Stack.Screen` and the `unstable_settings` anchor (not needed with single tab). Keep it simple:

```tsx
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
```

**Step 4: Delete unused files**

```bash
rm app/(tabs)/explore.tsx app/modal.tsx
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: set up app skeleton with single Map tab"
```

---

## Task 3: Build the HealthKit data layer

Create a hook that handles HealthKit authorization, queries workouts with routes, and clusters them by geographic area.

**Files:**
- Create: `hooks/use-health-trails.ts`
- Create: `lib/geo.ts` (clustering + bounding box utilities)

**Step 1: Create `lib/geo.ts`**

Geographic utilities for bounding boxes, distance, and clustering:

```typescript
export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function computeBoundingBox(coordinates: Coordinate[]): BoundingBox {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  for (const coord of coordinates) {
    minLat = Math.min(minLat, coord.latitude);
    maxLat = Math.max(maxLat, coord.latitude);
    minLng = Math.min(minLng, coord.longitude);
    maxLng = Math.max(maxLng, coord.longitude);
  }

  return { minLat, maxLat, minLng, maxLng };
}

export function bboxCenter(bbox: BoundingBox): Coordinate {
  return {
    latitude: (bbox.minLat + bbox.maxLat) / 2,
    longitude: (bbox.minLng + bbox.maxLng) / 2,
  };
}

export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface Trail {
  workoutId: string;
  activityType: number;
  startDate: string;
  endDate: string;
  duration: number; // seconds
  coordinates: Coordinate[];
  boundingBox: BoundingBox;
}

export interface TrailCluster {
  id: string;
  trails: Trail[];
  boundingBox: BoundingBox;
  label?: string;
}

export function clusterTrails(
  trails: Trail[],
  maxDistanceKm: number = 5,
): TrailCluster[] {
  const n = trails.length;
  if (n === 0) return [];

  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(a: number, b: number) {
    parent[find(a)] = find(b);
  }

  for (let i = 0; i < n; i++) {
    const ci = bboxCenter(trails[i].boundingBox);
    for (let j = i + 1; j < n; j++) {
      const cj = bboxCenter(trails[j].boundingBox);
      if (haversineKm(ci.latitude, ci.longitude, cj.latitude, cj.longitude) <= maxDistanceKm) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, Trail[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(trails[i]);
  }

  const clusters: TrailCluster[] = [];
  for (const [_, groupTrails] of groups) {
    const unionBbox: BoundingBox = {
      minLat: Math.min(...groupTrails.map(t => t.boundingBox.minLat)),
      maxLat: Math.max(...groupTrails.map(t => t.boundingBox.maxLat)),
      minLng: Math.min(...groupTrails.map(t => t.boundingBox.minLng)),
      maxLng: Math.max(...groupTrails.map(t => t.boundingBox.maxLng)),
    };

    clusters.push({
      id: groupTrails[0].workoutId,
      trails: groupTrails,
      boundingBox: unionBbox,
    });
  }

  // Sort by number of trails descending (most popular area first)
  clusters.sort((a, b) => b.trails.length - a.trails.length);

  return clusters;
}
```

**Step 2: Create `hooks/use-health-trails.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react';
import {
  requestAuthorization,
  queryWorkoutSamples,
} from '@kingstinct/react-native-healthkit';
import { WorkoutActivityType } from '@kingstinct/react-native-healthkit/types/Workouts';
import {
  computeBoundingBox,
  clusterTrails,
  type Trail,
  type TrailCluster,
} from '@/lib/geo';

const ACTIVITY_TYPES = [
  WorkoutActivityType.running,
  WorkoutActivityType.walking,
  WorkoutActivityType.cycling,
  WorkoutActivityType.hiking,
];

interface UseHealthTrailsOptions {
  startDate: Date;
  endDate: Date;
}

interface UseHealthTrailsResult {
  clusters: TrailCluster[];
  loading: boolean;
  error: string | null;
  totalTrails: number;
  refresh: () => void;
}

export function useHealthTrails({
  startDate,
  endDate,
}: UseHealthTrailsOptions): UseHealthTrailsResult {
  const [clusters, setClusters] = useState<TrailCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalTrails, setTotalTrails] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // 1. Request permissions
        await requestAuthorization({
          toRead: ['HKWorkoutTypeIdentifier', 'HKWorkoutRouteTypeIdentifier'],
        });

        // 2. Query workouts
        const workouts = await queryWorkoutSamples({
          limit: 0,
          ascending: false,
          filter: {
            OR: ACTIVITY_TYPES.map(type => ({ workoutActivityType: type })),
            date: { startDate, endDate },
          },
        });

        if (cancelled) return;

        // 3. Fetch routes for each workout
        const trails: Trail[] = [];

        for (const workout of workouts) {
          if (cancelled) return;

          try {
            const routes = await workout.getWorkoutRoutes();
            if (routes.length > 0 && routes[0].locations.length > 0) {
              const coordinates = routes[0].locations.map(loc => ({
                latitude: loc.latitude,
                longitude: loc.longitude,
              }));

              trails.push({
                workoutId: workout.uuid,
                activityType: workout.workoutActivityType,
                startDate: workout.startDate.toISOString(),
                endDate: workout.endDate.toISOString(),
                duration: workout.duration.quantity,
                coordinates,
                boundingBox: computeBoundingBox(coordinates),
              });
            }
          } catch {
            // Skip workouts where route fetch fails
          }
        }

        if (cancelled) return;

        // 4. Cluster
        const result = clusterTrails(trails);
        setClusters(result);
        setTotalTrails(trails.length);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load trails');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [startDate.getTime(), endDate.getTime(), refreshKey]);

  return { clusters, loading, error, totalTrails, refresh };
}
```

**Step 3: Commit**

```bash
git add lib/geo.ts hooks/use-health-trails.ts
git commit -m "feat: add HealthKit data layer with geo clustering"
```

---

## Task 4: Build the Map screen

The main screen: area picker at the top, date range filter, map filling the rest of the screen with stacked polylines.

**Files:**
- Rewrite: `app/(tabs)/index.tsx` — full Map screen
- Create: `components/area-picker.tsx` — horizontal scroll list of area chips
- Create: `components/date-range-picker.tsx` — simple date range selector

**Step 1: Create `components/date-range-picker.tsx`**

A simple component with preset buttons (1mo, 3mo, 6mo, 1yr, All) and a "from — to" display:

```tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface DateRangePickerProps {
  startDate: Date;
  endDate: Date;
  onRangeChange: (start: Date, end: Date) => void;
}

const PRESETS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: 'All', months: 120 }, // 10 years
] as const;

export function DateRangePicker({ startDate, endDate, onRangeChange }: DateRangePickerProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const getMonthsDiff = () => {
    const diffMs = endDate.getTime() - startDate.getTime();
    return Math.round(diffMs / (30 * 24 * 60 * 60 * 1000));
  };

  const activeMonths = getMonthsDiff();

  return (
    <View style={styles.container}>
      {PRESETS.map(preset => {
        const isActive = activeMonths === preset.months;
        return (
          <TouchableOpacity
            key={preset.label}
            style={[
              styles.chip,
              {
                backgroundColor: isActive ? colors.tint : colorScheme === 'dark' ? '#2a2d2e' : '#f0f0f0',
              },
            ]}
            onPress={() => {
              const end = new Date();
              const start = new Date();
              start.setMonth(start.getMonth() - preset.months);
              onRangeChange(start, end);
            }}>
            <Text
              style={[
                styles.chipText,
                { color: isActive ? '#fff' : colors.text },
              ]}>
              {preset.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
```

**Step 2: Create `components/area-picker.tsx`**

Horizontal scrollable chips for area/cluster selection:

```tsx
import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import type { TrailCluster } from '@/lib/geo';

interface AreaPickerProps {
  clusters: TrailCluster[];
  selectedClusterId: string | null;
  onSelect: (clusterId: string) => void;
}

export function AreaPicker({ clusters, selectedClusterId, onSelect }: AreaPickerProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  if (clusters.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      {clusters.map(cluster => {
        const isActive = cluster.id === selectedClusterId;
        return (
          <TouchableOpacity
            key={cluster.id}
            style={[
              styles.chip,
              {
                backgroundColor: isActive ? colors.tint : colorScheme === 'dark' ? '#2a2d2e' : '#f0f0f0',
                borderColor: isActive ? colors.tint : 'transparent',
              },
            ]}
            onPress={() => onSelect(cluster.id)}>
            <Text
              style={[
                styles.label,
                { color: isActive ? '#fff' : colors.text },
              ]}
              numberOfLines={1}>
              {cluster.label || 'Unknown area'}
            </Text>
            <Text
              style={[
                styles.count,
                { color: isActive ? 'rgba(255,255,255,0.7)' : colors.icon },
              ]}>
              {cluster.trails.length}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    maxWidth: 150,
  },
  count: {
    fontSize: 12,
    fontWeight: '500',
  },
});
```

**Step 3: Build the full Map screen `app/(tabs)/index.tsx`**

```tsx
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useHealthTrails } from '@/hooks/use-health-trails';
import { DateRangePicker } from '@/components/date-range-picker';
import { AreaPicker } from '@/components/area-picker';
import { bboxCenter } from '@/lib/geo';
import type { TrailCluster } from '@/lib/geo';

// Color palette for polylines — semi-transparent so stacking creates a heatmap effect
const TRAIL_COLOR = 'rgba(255, 59, 48, 0.35)';
const TRAIL_WIDTH = 2.5;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const mapRef = useRef<MapView>(null);

  // Date range state — default to last 6 months
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d;
  });
  const [endDate, setEndDate] = useState(() => new Date());

  const { clusters, loading, error, totalTrails } = useHealthTrails({
    startDate,
    endDate,
  });

  // Selected cluster
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  // Auto-select first cluster when clusters change
  useEffect(() => {
    if (clusters.length > 0 && !selectedClusterId) {
      setSelectedClusterId(clusters[0].id);
    }
  }, [clusters]);

  const selectedCluster = useMemo(
    () => clusters.find(c => c.id === selectedClusterId) ?? null,
    [clusters, selectedClusterId],
  );

  // Label clusters via reverse geocoding
  useEffect(() => {
    if (!mapRef.current || clusters.length === 0) return;

    async function labelAll() {
      for (const cluster of clusters) {
        if (cluster.label) continue;
        try {
          const center = bboxCenter(cluster.boundingBox);
          const address = await mapRef.current!.addressForCoordinate(center);
          cluster.label = [address.locality, address.administrativeArea]
            .filter(Boolean)
            .join(', ') || address.name;
        } catch {
          const center = bboxCenter(cluster.boundingBox);
          cluster.label = `${center.latitude.toFixed(1)}, ${center.longitude.toFixed(1)}`;
        }
      }
      // Force re-render after labeling
      setSelectedClusterId(prev => prev);
    }

    labelAll();
  }, [clusters]);

  // Fit map to selected cluster
  const fitToCluster = useCallback((cluster: TrailCluster) => {
    const allCoords = cluster.trails.flatMap(t => t.coordinates);
    if (allCoords.length === 0) return;
    mapRef.current?.fitToCoordinates(allCoords, {
      edgePadding: { top: 80, right: 40, bottom: 80, left: 40 },
      animated: true,
    });
  }, []);

  useEffect(() => {
    if (selectedCluster) {
      // Small delay to ensure map is ready
      setTimeout(() => fitToCluster(selectedCluster), 300);
    }
  }, [selectedCluster]);

  const handleAreaSelect = useCallback((id: string) => {
    setSelectedClusterId(id);
  }, []);

  const handleDateRangeChange = useCallback((start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
    setSelectedClusterId(null); // Reset selection when range changes
  }, []);

  return (
    <View style={styles.container}>
      {/* Map fills the screen */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        mapType={colorScheme === 'dark' ? 'mutedStandard' : 'mutedStandard'}
        showsUserLocation={false}
        showsCompass={true}
        showsScale={true}
        pitchEnabled={false}
      >
        {selectedCluster?.trails.map(trail => (
          <Polyline
            key={trail.workoutId}
            coordinates={trail.coordinates}
            strokeColor={TRAIL_COLOR}
            strokeWidth={TRAIL_WIDTH}
            lineCap="round"
            lineJoin="round"
          />
        ))}
      </MapView>

      {/* Controls overlay at top */}
      <View style={[styles.overlay, { paddingTop: insets.top + 8 }]}>
        <View
          style={[
            styles.controlsCard,
            {
              backgroundColor: colorScheme === 'dark'
                ? 'rgba(21, 23, 24, 0.9)'
                : 'rgba(255, 255, 255, 0.9)',
            },
          ]}>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onRangeChange={handleDateRangeChange}
          />
          <AreaPicker
            clusters={clusters}
            selectedClusterId={selectedClusterId}
            onSelect={handleAreaSelect}
          />
          {/* Trail count */}
          <View style={styles.statsRow}>
            <Text style={[styles.statsText, { color: colors.icon }]}>
              {loading ? 'Loading trails...' : `${selectedCluster?.trails.length ?? 0} trails`}
            </Text>
          </View>
        </View>
      </View>

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      )}

      {/* Error state */}
      {error && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  controlsCard: {
    marginHorizontal: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  statsRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  statsText: {
    fontSize: 12,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  errorOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    borderRadius: 12,
    padding: 16,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
});
```

**Step 4: Commit**

```bash
git add app/(tabs)/index.tsx app/(tabs)/_layout.tsx app/_layout.tsx components/area-picker.tsx components/date-range-picker.tsx
git commit -m "feat: build map screen with area picker and date filter"
```

---

## Task 5: Rebuild and test on device

**Step 1: Rebuild the iOS app**

```bash
npx expo run:ios --device
```

This will install the new CocoaPods (HealthKit, Maps) and deploy to the connected iPhone.

**Step 2: Manual testing checklist**

- [ ] App launches without crash
- [ ] HealthKit permission prompt appears
- [ ] After granting permission, trails load (spinner shows, then polylines appear)
- [ ] Area chips appear with reverse-geocoded city names
- [ ] Tapping a different area chip re-centers the map
- [ ] Date range buttons (1M, 3M, 6M, 1Y, All) change the loaded trails
- [ ] Stacked polylines create a visible heatmap-like effect on frequently-run routes
- [ ] Dark mode looks correct

**Step 3: Commit any fixes from testing**

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Install deps + config plugins | `package.json`, `app.json` |
| 2 | App skeleton | `app/(tabs)/*`, `app/_layout.tsx` |
| 3 | HealthKit data layer | `hooks/use-health-trails.ts`, `lib/geo.ts` |
| 4 | Map screen + UI components | `app/(tabs)/index.tsx`, `components/area-picker.tsx`, `components/date-range-picker.tsx` |
| 5 | Rebuild + test on device | Native rebuild + manual QA |

After these 5 tasks we'll have a working app that reads workout routes from Apple Health, clusters them by area, and stacks them on Apple Maps. From here we can iterate on polish (colors, trail type filtering, animation, etc.).
