# Phase 1: Visual Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Stack My Trails from a functional prototype to a premium-looking app with a teal-centric palette, Geist typography, glassmorphism accents, and opacity-stacked heatmap trails.

**Architecture:** Pure StyleSheet.create() styling updates across all screens. No new navigation routes, no data layer changes. Geist font loaded via expo-font (already a dependency). Tab icons use custom PNGs with SF Symbol fallbacks until assets are ready.

**Tech Stack:** React Native 0.81, Expo 54, expo-font, expo-splash-screen, react-native-maps, StyleSheet.create()

**Reference:** See `docs/plans/2026-02-09-visual-overhaul-and-export-design.md` for full design spec.

---

### Task 1: Download Geist Font & Configure Loading

**Files:**
- Create: `assets/fonts/Geist-Regular.otf`
- Create: `assets/fonts/Geist-Medium.otf`
- Create: `assets/fonts/Geist-SemiBold.otf`
- Create: `assets/fonts/Geist-Bold.otf`
- Modify: `app/_layout.tsx`

**Step 1: Create fonts directory and download Geist**

```bash
mkdir -p assets/fonts
# Download Geist font files from Vercel's GitHub release
curl -L "https://github.com/vercel/geist-font/raw/main/packages/next/dist/fonts/geist-sans/Geist-Regular.otf" -o assets/fonts/Geist-Regular.otf
curl -L "https://github.com/vercel/geist-font/raw/main/packages/next/dist/fonts/geist-sans/Geist-Medium.otf" -o assets/fonts/Geist-Medium.otf
curl -L "https://github.com/vercel/geist-font/raw/main/packages/next/dist/fonts/geist-sans/Geist-SemiBold.otf" -o assets/fonts/Geist-SemiBold.otf
curl -L "https://github.com/vercel/geist-font/raw/main/packages/next/dist/fonts/geist-sans/Geist-Bold.otf" -o assets/fonts/Geist-Bold.otf
```

If download URLs don't work, download manually from https://github.com/vercel/geist-font/releases — get the `.otf` files for Regular, Medium, SemiBold, Bold and place in `assets/fonts/`.

**Step 2: Update root layout to load fonts and gate rendering**

Modify `app/_layout.tsx` to:
- Import `useFonts` from `expo-font`
- Import `SplashScreen` from `expo-splash-screen`
- Call `SplashScreen.preventAutoHideAsync()` at module level
- Load all 4 Geist weights in `useFonts()`
- Gate rendering on `fontsLoaded`, hide splash when ready

The complete new `app/_layout.tsx`:

```tsx
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemeProvider } from '@/contexts/theme';
import { initDatabase } from '@/lib/db';

SplashScreen.preventAutoHideAsync();

function InnerLayout() {
  const colorScheme = useColorScheme();

  return (
    <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="filter-modal"
          options={{ presentation: 'modal', title: 'Filters' }}
        />
      </Stack>
      <StatusBar style="auto" />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Geist-Regular': require('../assets/fonts/Geist-Regular.otf'),
    'Geist-Medium': require('../assets/fonts/Geist-Medium.otf'),
    'Geist-SemiBold': require('../assets/fonts/Geist-SemiBold.otf'),
    'Geist-Bold': require('../assets/fonts/Geist-Bold.otf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SQLiteProvider databaseName="trails.db" onInit={initDatabase}>
      <ThemeProvider>
        <InnerLayout />
      </ThemeProvider>
    </SQLiteProvider>
  );
}
```

**Step 3: Verify type check passes**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add assets/fonts/ app/_layout.tsx
git commit -m "feat: add Geist font loading with splash screen gate"
```

---

### Task 2: Update Theme Constants — New Palette & Font Tokens

**Files:**
- Modify: `constants/theme.ts`

**Step 1: Replace entire `constants/theme.ts`**

New file with expanded color tokens, font family references, and helper constants:

```ts
import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1A1A2E',
    textSecondary: '#6B7280',
    background: '#F8FAFB',
    surface: '#FFFFFF',
    surfaceGlass: 'rgba(255,255,255,0.85)',
    tint: '#2DD4BF',
    teal: '#2DD4BF',
    orange: '#FB923C',
    sky: '#60A5FA',
    icon: '#6B7280',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: '#2DD4BF',
    border: '#E5E7EB',
    danger: '#EF4444',
    trailStroke: 'rgba(45,212,191,0.8)',
    trailStrokeStacked: 'rgba(45,212,191,0.25)',
  },
  dark: {
    text: '#F0F0F0',
    textSecondary: '#9CA3AF',
    background: '#121212',
    surface: '#1E1E1E',
    surfaceGlass: 'rgba(30,30,30,0.80)',
    tint: '#2DD4BF',
    teal: '#2DD4BF',
    orange: '#FB923C',
    sky: '#60A5FA',
    icon: '#9CA3AF',
    tabIconDefault: '#6B7280',
    tabIconSelected: '#2DD4BF',
    border: '#2A2D2E',
    danger: '#EF4444',
    trailStroke: 'rgba(45,212,191,0.8)',
    trailStrokeStacked: 'rgba(45,212,191,0.30)',
  },
};

export const Fonts = {
  regular: 'Geist-Regular',
  medium: 'Geist-Medium',
  semibold: 'Geist-SemiBold',
  bold: 'Geist-Bold',
  // Fallbacks for platforms where Geist isn't loaded yet
  system: Platform.select({
    ios: 'System',
    default: 'sans-serif',
  }),
};
```

**Step 2: Verify type check passes**

```bash
npx tsc --noEmit
```

This will likely surface type errors in files that reference old color tokens (e.g., `colors.tabIconDefault` still works, but anything referencing removed properties will fail). Fix any issues.

**Step 3: Commit**

```bash
git add constants/theme.ts
git commit -m "feat: update color palette to teal-centric design with Geist font tokens"
```

---

### Task 3: Restyle Tab Bar

**Files:**
- Create: `assets/icons/` (placeholder — user will add PNGs later)
- Modify: `app/(tabs)/_layout.tsx`

**Step 1: Update tab layout**

Replace `app/(tabs)/_layout.tsx` with new tab bar configuration:
- Use `surfaceGlass` colors from new palette
- Hide labels (`tabBarShowLabel: false`)
- Add subtle shadow instead of border
- Keep SF Symbol icons as fallback (user will provide custom PNGs later)
- Update tint colors to teal

```tsx
import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: colors.surfaceGlass,
          borderTopWidth: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 0,
          height: 60,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Trails',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="figure.run" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stack"
        options={{
          title: 'Stack',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="map.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="gearshape.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

**Step 2: Type check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/(tabs)/_layout.tsx
git commit -m "feat: restyle tab bar with teal accents, hidden labels, subtle shadow"
```

---

### Task 4: Redesign Trails Screen

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Step 1: Update the full trails screen**

This is the largest single file change. Key differences from current:
- Geist font family on all text
- New card styling with `surface` bg, `borderRadius: 20`, subtle shadow
- Selected state uses left teal accent bar instead of background color change
- Metadata pills (duration, temperature) with teal tint
- Empty state with teal button
- Updated color references throughout

Replace the entire file with the redesigned version:

```tsx
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import MapView, { Polyline } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";
import { useRouter, useFocusEffect } from "expo-router";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, Fonts } from "@/constants/theme";
import {
  getAllTrailSummaries,
  getTrailCoordinates,
} from "@/lib/db";
import { resolveLabel } from "@/lib/geocode";
import { bboxCenter } from "@/lib/geo";
import type { TrailSummary, Coordinate } from "@/lib/geo";

const ACTIVITY_LABELS: Record<number, string> = {
  13: "Cycling",
  24: "Hiking",
  37: "Running",
  46: "Swimming",
  52: "Walking",
};

const ACTIVITY_ICONS: Record<number, string> = {
  13: "\u{1F6B2}",
  24: "\u{26F0}",
  37: "\u{1F3C3}",
  46: "\u{1F3CA}",
  52: "\u{1F6B6}",
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTemp(celsius: number | null | undefined): string | null {
  if (celsius == null) return null;
  return `${Math.round(celsius)}\u00B0C`;
}

export default function TrailsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const mapRef = useRef<MapView>(null);
  const db = useSQLiteContext();
  const router = useRouter();

  const [trails, setTrails] = useState<TrailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCoords, setSelectedCoords] = useState<Coordinate[]>([]);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      getAllTrailSummaries(db).then((data) => {
        setTrails(data);
        setLoading(false);
        if (data.length > 0 && !selectedId) {
          setSelectedId(data[0].workoutId);
        }
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db]),
  );

  useEffect(() => {
    if (!selectedId) {
      setSelectedCoords([]);
      return;
    }
    getTrailCoordinates(db, selectedId).then(setSelectedCoords);
  }, [db, selectedId]);

  useEffect(() => {
    if (selectedCoords.length === 0) return;
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(selectedCoords, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [selectedCoords]);

  useEffect(() => {
    if (trails.length === 0) return;
    let cancelled = false;

    async function resolveLabels() {
      const newLabels = new Map(labels);
      for (const trail of trails) {
        if (newLabels.has(trail.workoutId) || cancelled) continue;
        const center = bboxCenter(trail.boundingBox);
        const label = await resolveLabel(db, center);
        newLabels.set(trail.workoutId, label);
      }
      if (!cancelled) setLabels(newLabels);
    }

    resolveLabels();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trails, db]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: TrailSummary }) => {
      const isActive = item.workoutId === selectedId;
      const label = labels.get(item.workoutId);
      const temp = formatTemp(item.temperature);

      return (
        <TouchableOpacity
          style={[
            styles.trailCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
          onPress={() => handleSelect(item.workoutId)}
          activeOpacity={0.7}
        >
          {isActive && (
            <View style={[styles.activeBar, { backgroundColor: colors.teal }]} />
          )}
          <View style={styles.cardContent}>
            <View style={styles.cardTopRow}>
              <Text style={styles.activityIcon}>
                {ACTIVITY_ICONS[item.activityType] ?? "\u{1F3C3}"}
              </Text>
              <View style={styles.cardTitleBlock}>
                <Text
                  style={[styles.trailTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {ACTIVITY_LABELS[item.activityType] ?? "Workout"}
                  {" \u00B7 "}
                  {formatDate(item.startDate)}
                </Text>
                <Text
                  style={[styles.trailSubtitle, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {label ?? "Loading..."}
                </Text>
              </View>
            </View>
            <View style={styles.pillRow}>
              <View style={[styles.pill, { backgroundColor: `${colors.teal}1A` }]}>
                <Text style={[styles.pillText, { color: colors.teal }]}>
                  {formatDuration(item.duration)}
                </Text>
              </View>
              {temp && (
                <View style={[styles.pill, { backgroundColor: colors.border }]}>
                  <Text style={[styles.pillText, { color: colors.textSecondary }]}>
                    {temp}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [selectedId, labels, colors, handleSelect],
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.teal} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading trails...
        </Text>
      </View>
    );
  }

  if (trails.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Text style={styles.emptyIcon}>{"\u{1F3DE}"}</Text>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          No trails yet
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          Import your workouts from Apple Health to see them here.
        </Text>
        <TouchableOpacity
          style={[styles.emptyButton, { backgroundColor: colors.teal }]}
          onPress={() => router.push("/(tabs)/settings")}>
          <Text style={styles.emptyButtonText}>Import from Health</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Preview map — top half */}
      <View style={[styles.mapContainer, { paddingTop: insets.top }]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          mapType="mutedStandard"
          userInterfaceStyle={colorScheme}
          showsCompass={false}
          pitchEnabled={false}
          rotateEnabled={false}
        >
          {selectedCoords.length > 0 && (
            <Polyline
              coordinates={selectedCoords}
              strokeColor={colors.trailStroke}
              strokeWidth={3.5}
              lineCap="round"
              lineJoin="round"
            />
          )}
        </MapView>
      </View>

      {/* Trail list — bottom half */}
      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={[styles.listLabel, { color: colors.textSecondary }]}>
            YOUR TRAILS
          </Text>
          <Text style={[styles.listCount, { color: colors.textSecondary }]}>
            {trails.length}
          </Text>
        </View>
        <FlatList
          data={trails}
          keyExtractor={(item) => item.workoutId}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 70,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  loadingText: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    marginTop: 12,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.2,
  },
  emptyTitle: {
    fontFamily: Fonts.semibold,
    fontSize: 20,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
  },
  emptyButtonText: {
    color: "#fff",
    fontFamily: Fonts.semibold,
    fontSize: 16,
  },
  mapContainer: {
    height: "50%",
  },
  listContainer: {
    flex: 1,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  listLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  listCount: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  trailCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 1.5,
  },
  cardContent: {
    padding: 16,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  activityIcon: {
    fontSize: 24,
  },
  cardTitleBlock: {
    flex: 1,
  },
  trailTitle: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  trailSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    marginTop: 2,
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingLeft: 36,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pillText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
  },
});
```

**Step 2: Type check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat: redesign trails screen with cards, teal accents, Geist typography"
```

---

### Task 5: Redesign Stack Screen

**Files:**
- Modify: `app/(tabs)/stack.tsx`

**Step 1: Update the full stack screen**

Key changes:
- Trail width reduced to 2.5 (from 3) for better opacity stacking
- Floating top card uses glassmorphism (`surfaceGlass` + BlurView)
- `borderRadius: 24` on top card
- Geist fonts throughout
- Filter button restyled as icon-style button
- Updated empty state
- Teal-centric colors

```tsx
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Fonts } from '@/constants/theme';
import { getTrailCount } from '@/lib/db';
import { useTrails } from '@/hooks/use-trails';
import type { Trail } from '@/lib/geo';

const TRAIL_WIDTH = 2.5;

export default function StackScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const db = useSQLiteContext();
  const [hasTrails, setHasTrails] = useState(true);

  useFocusEffect(
    useCallback(() => {
      getTrailCount(db).then((count) => setHasTrails(count > 0));
    }, [db]),
  );

  const params = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
    areaLabels?: string;
    areaLabel?: string;
  }>();

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d;
  });
  const [endDate, setEndDate] = useState(() => new Date());
  const [filterLabels, setFilterLabels] = useState<string[] | null>(null);
  const [areaLabel, setAreaLabel] = useState<string | null>(null);

  useEffect(() => {
    if (params.startDate) setStartDate(new Date(params.startDate));
    if (params.endDate) setEndDate(new Date(params.endDate));
    if (params.areaLabels) {
      try {
        setFilterLabels(JSON.parse(params.areaLabels));
      } catch {}
    } else {
      setFilterLabels(null);
    }
    if (params.areaLabel) setAreaLabel(params.areaLabel);
  }, [params.startDate, params.endDate, params.areaLabels, params.areaLabel]);

  const { clusters, loading, loadClusterTrails } = useTrails({
    startDate,
    endDate,
    labels: filterLabels,
  });

  const selectedCluster = useMemo(
    () => (clusters.length > 0 ? clusters[0] : null),
    [clusters],
  );

  const [renderedTrails, setRenderedTrails] = useState<Trail[]>([]);
  const [loadingTrails, setLoadingTrails] = useState(false);

  useEffect(() => {
    if (!selectedCluster) {
      setRenderedTrails([]);
      return;
    }

    let cancelled = false;
    setLoadingTrails(true);
    setRenderedTrails([]);

    loadClusterTrails(selectedCluster).then((trails) => {
      if (!cancelled) {
        setRenderedTrails(trails);
        setLoadingTrails(false);

        const allCoords = trails.flatMap((t) => t.coordinates);
        if (allCoords.length > 0) {
          setTimeout(() => {
            mapRef.current?.fitToCoordinates(allCoords, {
              edgePadding: { top: 120, right: 40, bottom: 80, left: 40 },
              animated: true,
            });
          }, 200);
        }
      }
    });

    return () => { cancelled = true; };
  }, [selectedCluster, loadClusterTrails]);

  const openFilters = useCallback(() => {
    router.push({
      pathname: '/filter-modal',
      params: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        areaLabels: filterLabels ? JSON.stringify(filterLabels) : '',
        areaLabel: areaLabel ?? '',
      },
    });
  }, [router, startDate, endDate, filterLabels, areaLabel]);

  const totalInCluster = selectedCluster?.summaries.length ?? 0;

  if (!hasTrails) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Text style={styles.emptyIcon}>{"\u{1F5FA}"}</Text>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          No trails yet
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          Import your workouts first to stack them on the map.
        </Text>
        <TouchableOpacity
          style={[styles.emptyButton, { backgroundColor: colors.teal }]}
          onPress={() => router.push("/(tabs)/settings")}>
          <Text style={styles.emptyButtonText}>Go to Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        mapType="mutedStandard"
        userInterfaceStyle={colorScheme}
        showsCompass={true}
        showsScale={true}
        pitchEnabled={false}>
        {renderedTrails.map((trail) => (
          <Polyline
            key={trail.workoutId}
            coordinates={trail.coordinates}
            strokeColor={colors.trailStrokeStacked}
            strokeWidth={TRAIL_WIDTH}
            lineCap="round"
            lineJoin="round"
          />
        ))}
      </MapView>

      {/* Floating top card */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View
          style={[
            styles.topCard,
            { backgroundColor: colors.surfaceGlass },
          ]}>
          <View style={styles.topRow}>
            <View style={styles.topInfo}>
              <Text
                style={[styles.clusterLabel, { color: colors.text }]}
                numberOfLines={1}>
                {areaLabel ?? 'Select an area'}
              </Text>
              <Text style={[styles.trailCount, { color: colors.textSecondary }]}>
                {loading || loadingTrails
                  ? 'Loading...'
                  : `${renderedTrails.length}${totalInCluster > renderedTrails.length ? ` of ${totalInCluster}` : ''} trails`}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.filterButton, { backgroundColor: `${colors.teal}1A` }]}
              onPress={openFilters}>
              <Text style={[styles.filterButtonText, { color: colors.teal }]}>
                Filters
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loadingTrails && (
        <View style={[styles.loadingOverlay, { backgroundColor: `${colors.background}80` }]}>
          <ActivityIndicator size="large" color={colors.teal} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading trails...
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.2,
  },
  emptyTitle: {
    fontFamily: Fonts.semibold,
    fontSize: 20,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
  },
  emptyButtonText: {
    color: '#fff',
    fontFamily: Fonts.semibold,
    fontSize: 16,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  topCard: {
    marginHorizontal: 12,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topInfo: {
    flex: 1,
    marginRight: 12,
  },
  clusterLabel: {
    fontFamily: Fonts.semibold,
    fontSize: 15,
  },
  trailCount: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    marginTop: 2,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  filterButtonText: {
    fontFamily: Fonts.semibold,
    fontSize: 14,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
});
```

**Step 2: Type check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/(tabs)/stack.tsx
git commit -m "feat: redesign stack screen with glassmorphism card, teal opacity trails"
```

---

### Task 6: Redesign Settings Screen

**Files:**
- Modify: `app/(tabs)/settings.tsx`

**Step 1: Update the full settings screen**

Key changes:
- Separate sections: Appearance, Health Data, Data Management
- Segmented control for theme (teal active)
- Cards use `surface` bg, `borderRadius: 20`
- Import buttons: primary solid teal, secondary outlined teal
- Delete button separated, danger color
- Geist fonts throughout
- Progress bar: 4px height, teal fill
- Footer with version and supported activities

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Fonts } from '@/constants/theme';
import { useImportTrails } from '@/hooks/use-import-trails';
import { getTrailCount, getLastImportDate, getLatestTrailDate, deleteAllTrails } from '@/lib/db';
import { useThemePreference, type ThemePreference } from '@/contexts/theme';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const db = useSQLiteContext();
  const { preference, setPreference } = useThemePreference();

  const { importing, progress, total, error, startImport } = useImportTrails();
  const [trailCount, setTrailCount] = useState(0);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refreshStats = useCallback(() => {
    getTrailCount(db).then(setTrailCount);
    getLastImportDate(db).then(setLastImport);
  }, [db]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats, importing, deleting]);

  const handleFetchNew = useCallback(async () => {
    const latest = await getLatestTrailDate(db);
    startImport(latest);
  }, [db, startImport]);

  const handleDeleteAll = useCallback(() => {
    Alert.alert(
      'Delete All Data',
      'This will remove all imported trails and cached labels. You will need to re-import from Health.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            await deleteAllTrails(db);
            setDeleting(false);
          },
        },
      ],
    );
  }, [db]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 80,
      }}>
      <Text style={[styles.screenTitle, { color: colors.text }]}>Settings</Text>

      {/* Appearance section */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        APPEARANCE
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.segmentedControl, { backgroundColor: colors.border }]}>
          {THEME_OPTIONS.map((opt) => {
            const isActive = preference === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.segment,
                  isActive && { backgroundColor: colors.teal },
                ]}
                onPress={() => setPreference(opt.value)}>
                <Text
                  style={[
                    styles.segmentText,
                    { color: isActive ? '#fff' : colors.textSecondary },
                  ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Health Data section */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        HEALTH DATA
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.statRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Total trails
          </Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {trailCount}
          </Text>
        </View>

        <View style={styles.statRowLast}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Last import
          </Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {lastImport ? formatRelativeDate(lastImport) : 'Never'}
          </Text>
        </View>
      </View>

      {/* Import progress */}
      {importing && (
        <View style={styles.progressSection}>
          <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: colors.teal,
                  width: total > 0 ? `${(progress / total) * 100}%` : '0%',
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {total > 0
              ? `${progress} / ${total} workouts`
              : 'Fetching workouts...'}
          </Text>
        </View>
      )}

      {error && (
        <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
      )}

      {/* Import buttons */}
      <View style={styles.buttonGroup}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            {
              backgroundColor: colors.teal,
              opacity: importing ? 0.6 : 1,
            },
          ]}
          onPress={() => startImport()}
          disabled={importing}>
          <Text style={styles.primaryButtonText}>
            {importing
              ? 'Importing...'
              : trailCount > 0
                ? 'Re-import All'
                : 'Import from Health'}
          </Text>
        </TouchableOpacity>

        {trailCount > 0 && (
          <TouchableOpacity
            style={[
              styles.outlinedButton,
              {
                borderColor: colors.teal,
                opacity: importing ? 0.6 : 1,
              },
            ]}
            onPress={handleFetchNew}
            disabled={importing}>
            <Text style={[styles.outlinedButtonText, { color: colors.teal }]}>
              Fetch New Routes
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Imports running, walking, cycling, hiking, and open water swimming
        workouts with GPS routes from Apple Health.
      </Text>

      {/* Data section */}
      {trailCount > 0 && (
        <>
          <View style={[styles.dangerSeparator, { borderTopColor: colors.border }]} />
          <TouchableOpacity
            style={[styles.deleteButton, { opacity: importing || deleting ? 0.6 : 1 }]}
            onPress={handleDeleteAll}
            disabled={importing || deleting}>
            <Text style={[styles.deleteButtonText, { color: colors.danger }]}>
              {deleting ? 'Deleting...' : 'Delete All Data'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* Footer */}
      <Text style={[styles.footer, { color: colors.textSecondary }]}>
        Stack My Trails v1.0
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenTitle: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    letterSpacing: 1.5,
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentText: {
    fontFamily: Fonts.semibold,
    fontSize: 15,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  statLabel: {
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
  statValue: {
    fontFamily: Fonts.semibold,
    fontSize: 15,
  },
  progressSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  buttonGroup: {
    marginHorizontal: 16,
    gap: 12,
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontFamily: Fonts.semibold,
    fontSize: 16,
  },
  outlinedButton: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  outlinedButtonText: {
    fontFamily: Fonts.semibold,
    fontSize: 16,
  },
  hint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    marginHorizontal: 20,
    marginTop: 12,
    lineHeight: 16,
  },
  dangerSeparator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginTop: 32,
  },
  deleteButton: {
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontFamily: Fonts.semibold,
    fontSize: 16,
  },
  footer: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 32,
  },
});
```

**Step 2: Type check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/(tabs)/settings.tsx
git commit -m "feat: redesign settings screen with sectioned cards and segmented theme control"
```

---

### Task 7: Redesign Filter Modal

**Files:**
- Modify: `app/filter-modal.tsx`

**Step 1: Update the full filter modal**

Key changes:
- Section labels use uppercase tracking ("DATE RANGE", "AREAS")
- Preset pills: teal active, surface+border inactive
- Area count shown as teal pill (teal text on teal/10% bg)
- Updated border radius and colors
- Apply button: teal, borderRadius: 16
- Geist fonts throughout
- Drag handle at top

```tsx
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Fonts } from '@/constants/theme';
import { getAllTrailSummaries } from '@/lib/db';
import type { TrailSummary } from '@/lib/geo';

const PRESETS = [
  { label: '1D', days: 1 },
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '6M', days: 183 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 3650 },
] as const;

interface SubArea {
  label: string;
  fullLabel: string;
  count: number;
  labels: string[];
}

interface AreaGroup {
  label: string;
  subAreas: SubArea[];
  totalCount: number;
  allLabels: string[];
}

function extractCity(label: string): string {
  const idx = label.lastIndexOf(', ');
  return idx >= 0 ? label.substring(idx + 2) : label;
}

function extractLocality(label: string): string {
  const idx = label.lastIndexOf(', ');
  return idx >= 0 ? label.substring(0, idx) : label;
}

function buildAreaGroups(summaries: TrailSummary[]): AreaGroup[] {
  const byLabel = new Map<string, number>();
  for (const s of summaries) {
    const label = s.locationLabel || 'Unknown';
    byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
  }

  const cityMap = new Map<string, { label: string; count: number }[]>();
  for (const [label, count] of byLabel) {
    const city = extractCity(label);
    if (!cityMap.has(city)) cityMap.set(city, []);
    cityMap.get(city)!.push({ label, count });
  }

  const result: AreaGroup[] = [];
  for (const [city, entries] of cityMap) {
    const localityMap = new Map<
      string,
      { count: number; labels: string[] }
    >();
    for (const e of entries) {
      const locality = extractLocality(e.label);
      const existing = localityMap.get(locality);
      if (existing) {
        existing.count += e.count;
        existing.labels.push(e.label);
      } else {
        localityMap.set(locality, { count: e.count, labels: [e.label] });
      }
    }

    const subAreas: SubArea[] = [...localityMap.entries()]
      .map(([locality, data]) => ({
        label: locality,
        fullLabel: locality === city ? city : `${locality}, ${city}`,
        count: data.count,
        labels: data.labels,
      }))
      .sort((a, b) => b.count - a.count);

    const totalCount = subAreas.reduce((s, a) => s + a.count, 0);
    const allLabels = entries.map((e) => e.label);

    result.push({ label: city, subAreas, totalCount, allLabels });
  }

  return result.sort((a, b) => b.totalCount - a.totalCount);
}

export default function FilterModal() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
    areaLabels?: string;
    areaLabel?: string;
  }>();

  const [startDate, setStartDate] = useState(
    params.startDate
      ? new Date(params.startDate)
      : new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000),
  );
  const [endDate, setEndDate] = useState(
    params.endDate ? new Date(params.endDate) : new Date(),
  );
  const [selectedLabels, setSelectedLabels] = useState<string[]>(() => {
    if (params.areaLabels) {
      try {
        return JSON.parse(params.areaLabels);
      } catch {}
    }
    return [];
  });
  const [selectedDisplayLabel, setSelectedDisplayLabel] = useState<string>(
    params.areaLabel ?? '',
  );
  const [showCustomStart, setShowCustomStart] = useState(false);
  const [showCustomEnd, setShowCustomEnd] = useState(false);
  const [areaGroups, setAreaGroups] = useState<AreaGroup[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      const summaries = await getAllTrailSummaries(db);
      if (cancelled) return;
      setAreaGroups(buildAreaGroups(summaries));
      setLoadingAreas(false);

      if (selectedLabels.length > 0) {
        const groups = buildAreaGroups(summaries);
        for (let i = 0; i < groups.length; i++) {
          const hasMatch = groups[i].allLabels.some((l) =>
            selectedLabels.includes(l),
          );
          if (hasMatch) {
            setExpandedGroups(new Set([i]));
            break;
          }
        }
      }
    }

    loadAreas();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  const getActivePreset = () => {
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
    return PRESETS.find((p) => Math.abs(p.days - diffDays) <= 1)?.label ?? null;
  };

  const handlePreset = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    setStartDate(start);
    setEndDate(end);
    setShowCustomStart(false);
    setShowCustomEnd(false);
  };

  const selectArea = (labels: string[], displayLabel: string) => {
    setSelectedLabels(labels);
    setSelectedDisplayLabel(displayLabel);
  };

  const handleApply = () => {
    router.back();
    setTimeout(() => {
      router.setParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        areaLabels: JSON.stringify(selectedLabels),
        areaLabel: selectedDisplayLabel,
      });
    }, 100);
  };

  const toggleGroup = (idx: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const labelsMatch = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false;
    return a.every((l) => b.includes(l));
  };

  const activePreset = getActivePreset();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingBottom: insets.bottom },
      ]}>
      {/* Drag handle */}
      <View style={styles.handleContainer}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
      </View>

      {/* Fixed date range section */}
      <View style={styles.fixedSection}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          DATE RANGE
        </Text>

        <View style={styles.presetRow}>
          {PRESETS.map((preset) => {
            const isActive = activePreset === preset.label;
            return (
              <TouchableOpacity
                key={preset.label}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: isActive
                      ? colors.teal
                      : colors.surface,
                    borderColor: isActive ? colors.teal : colors.border,
                  },
                ]}
                onPress={() => handlePreset(preset.days)}>
                <Text
                  style={[
                    styles.presetText,
                    { color: isActive ? '#fff' : colors.textSecondary },
                  ]}>
                  {preset.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.dateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.dateRow}
            onPress={() => {
              setShowCustomStart(!showCustomStart);
              setShowCustomEnd(false);
            }}>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>From</Text>
            <Text style={[styles.dateValue, { color: colors.text }]}>
              {startDate.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </TouchableOpacity>

          {showCustomStart && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={endDate}
              onChange={(_, date) => {
                if (date) setStartDate(date);
              }}
              themeVariant={colorScheme}
              accentColor={colors.teal}
            />
          )}

          <View
            style={[styles.dateSeparator, { backgroundColor: colors.border }]}
          />

          <TouchableOpacity
            style={styles.dateRow}
            onPress={() => {
              setShowCustomEnd(!showCustomEnd);
              setShowCustomStart(false);
            }}>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>To</Text>
            <Text style={[styles.dateValue, { color: colors.text }]}>
              {endDate.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </TouchableOpacity>

          {showCustomEnd && (
            <DateTimePicker
              value={endDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={startDate}
              maximumDate={new Date()}
              onChange={(_, date) => {
                if (date) setEndDate(date);
              }}
              themeVariant={colorScheme}
              accentColor={colors.teal}
            />
          )}
        </View>
      </View>

      {/* Scrollable area selection */}
      <View style={styles.areaSection}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          AREAS
        </Text>
        {loadingAreas ? (
          <View style={styles.areaLoading}>
            <ActivityIndicator size="small" color={colors.teal} />
            <Text style={[styles.areaLoadingText, { color: colors.textSecondary }]}>
              Loading areas...
            </Text>
          </View>
        ) : areaGroups.length > 0 && (
          <ScrollView
            style={styles.areaScroll}
            showsVerticalScrollIndicator={false}>
            <View style={[styles.areaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {areaGroups.map((group, gIdx) => {
                const hasSubs = group.subAreas.length > 1;
                const isExpanded = expandedGroups.has(gIdx);
                const groupSelected = labelsMatch(
                  selectedLabels,
                  group.allLabels,
                );
                const isLast = gIdx === areaGroups.length - 1;

                if (!hasSubs) {
                  const sub = group.subAreas[0];
                  const isActive = labelsMatch(selectedLabels, sub.labels);

                  return (
                    <TouchableOpacity
                      key={gIdx}
                      style={[
                        styles.areaRow,
                        !isLast && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.border,
                        },
                      ]}
                      onPress={() => selectArea(sub.labels, sub.fullLabel)}>
                      <View
                        style={[
                          styles.radio,
                          {
                            borderColor: isActive ? colors.teal : colors.textSecondary,
                            backgroundColor: isActive
                              ? colors.teal
                              : 'transparent',
                          },
                        ]}
                      />
                      <Text
                        style={[styles.areaLabel, { color: colors.text }]}
                        numberOfLines={1}>
                        {sub.fullLabel}
                      </Text>
                      <View style={[styles.countPill, { backgroundColor: `${colors.teal}1A` }]}>
                        <Text style={[styles.countPillText, { color: colors.teal }]}>
                          {sub.count}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }

                return (
                  <View key={gIdx}>
                    <TouchableOpacity
                      style={[
                        styles.areaRow,
                        !isExpanded &&
                          !isLast && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: colors.border,
                          },
                      ]}
                      onPress={() => {
                        selectArea(group.allLabels, group.label);
                        toggleGroup(gIdx);
                      }}>
                      <View
                        style={[
                          styles.radio,
                          {
                            borderColor: groupSelected
                              ? colors.teal
                              : colors.textSecondary,
                            backgroundColor: groupSelected
                              ? colors.teal
                              : 'transparent',
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.areaLabel,
                          { color: colors.text, fontFamily: Fonts.medium },
                        ]}
                        numberOfLines={1}>
                        {group.label}
                      </Text>
                      <View style={[styles.countPill, { backgroundColor: `${colors.teal}1A` }]}>
                        <Text style={[styles.countPillText, { color: colors.teal }]}>
                          {group.totalCount}
                        </Text>
                      </View>
                      <Text style={[styles.chevron, { color: colors.textSecondary }]}>
                        {isExpanded ? '\u25B4' : '\u25BE'}
                      </Text>
                    </TouchableOpacity>

                    {isExpanded &&
                      group.subAreas.map((sub, sIdx) => {
                        const subSelected = labelsMatch(
                          selectedLabels,
                          sub.labels,
                        );
                        const subIsLast =
                          sIdx === group.subAreas.length - 1 && isLast;

                        return (
                          <TouchableOpacity
                            key={sIdx}
                            style={[
                              styles.areaRow,
                              styles.subAreaRow,
                              !subIsLast && {
                                borderBottomWidth: StyleSheet.hairlineWidth,
                                borderBottomColor: colors.border,
                              },
                            ]}
                            onPress={() =>
                              selectArea(sub.labels, sub.fullLabel)
                            }>
                            <View
                              style={[
                                styles.radioSmall,
                                {
                                  borderColor: subSelected
                                    ? colors.teal
                                    : colors.textSecondary,
                                  backgroundColor: subSelected
                                    ? colors.teal
                                    : 'transparent',
                                },
                              ]}
                            />
                            <Text
                              style={[styles.areaLabel, { color: colors.text }]}
                              numberOfLines={1}>
                              {sub.label}
                            </Text>
                            <View style={[styles.countPill, { backgroundColor: `${colors.teal}1A` }]}>
                              <Text style={[styles.countPillText, { color: colors.teal }]}>
                                {sub.count}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Apply button */}
      <View style={styles.applyContainer}>
        <TouchableOpacity
          style={[
            styles.applyButton,
            {
              backgroundColor: colors.teal,
              opacity: selectedLabels.length === 0 ? 0.4 : 1,
            },
          ]}
          onPress={handleApply}
          disabled={selectedLabels.length === 0}>
          <Text style={styles.applyButtonText}>Apply Filters</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  fixedSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  areaSection: {
    flex: 1,
    paddingHorizontal: 20,
    minHeight: 0,
  },
  areaLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  areaLoadingText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
  },
  areaScroll: {
    flex: 1,
  },
  sectionLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 12,
    marginTop: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  presetText: {
    fontFamily: Fonts.semibold,
    fontSize: 13,
  },
  dateCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 24,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  dateLabel: {
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
  dateValue: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  dateSeparator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  areaCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 8,
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  subAreaRow: {
    paddingLeft: 40,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  radioSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  areaLabel: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  countPillText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
  },
  chevron: {
    fontSize: 12,
    marginLeft: 4,
  },
  applyContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  applyButton: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontFamily: Fonts.semibold,
    fontSize: 17,
  },
});
```

**Step 2: Type check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/filter-modal.tsx
git commit -m "feat: redesign filter modal with teal pills, tracking labels, count badges"
```

---

### Task 8: Final Type Check & Cleanup

**Files:**
- Potentially any file with type errors

**Step 1: Run full type check**

```bash
npx tsc --noEmit
```

Fix any remaining type errors. Common issues:
- Old color token references (e.g., `colors.icon` still works but some code may reference removed tokens)
- `Fonts` import missing in files that use `fontFamily`

**Step 2: Run lint**

```bash
npx expo lint
```

Fix any lint issues.

**Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "chore: fix type check and lint issues from visual overhaul"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `assets/fonts/*`, `app/_layout.tsx` | Geist font setup + splash gate |
| 2 | `constants/theme.ts` | New color palette + font tokens |
| 3 | `app/(tabs)/_layout.tsx` | Tab bar restyle |
| 4 | `app/(tabs)/index.tsx` | Trails screen redesign |
| 5 | `app/(tabs)/stack.tsx` | Stack screen redesign |
| 6 | `app/(tabs)/settings.tsx` | Settings screen redesign |
| 7 | `app/filter-modal.tsx` | Filter modal redesign |
| 8 | — | Type check + lint cleanup |

**After completing all tasks:** Run on device (`npx expo run:ios --device`) to verify visual results. Screenshots and adjustments will be done iteratively on device.

**Blocked item:** Custom tab icons (Task 3 uses SF Symbol fallbacks). User will export PNGs per spec in the design doc and we'll swap them in.
