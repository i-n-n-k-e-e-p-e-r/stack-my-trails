import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { getTrailCount } from '@/lib/db';
import { useTrails } from '@/hooks/use-trails';
import type { Trail } from '@/lib/geo';

const TRAIL_WIDTH = 3;

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

  // Load coordinates on demand
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
              edgePadding: { top: 100, right: 40, bottom: 80, left: 40 },
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
        <Text style={[styles.emptySubtitle, { color: colors.icon }]}>
          Import your workouts first to stack them on the map.
        </Text>
        <TouchableOpacity
          style={[styles.emptyButton, { backgroundColor: colors.tint }]}
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

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View
          style={[
            styles.topCard,
            {
              backgroundColor:
                colorScheme === 'dark'
                  ? 'rgba(21, 23, 24, 0.9)'
                  : 'rgba(255, 255, 255, 0.9)',
            },
          ]}>
          <View style={styles.topRow}>
            <View style={styles.topInfo}>
              <Text
                style={[styles.clusterLabel, { color: colors.text }]}
                numberOfLines={1}>
                {areaLabel ?? 'Select an area'}
              </Text>
              <Text style={[styles.trailCount, { color: colors.icon }]}>
                {loading || loadingTrails
                  ? 'Loading...'
                  : `${renderedTrails.length}${totalInCluster > renderedTrails.length ? ` of ${totalInCluster}` : ''} trails`}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.filterButton, { backgroundColor: colors.tint }]}
              onPress={openFilters}>
              <Text style={styles.filterButtonText}>Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loadingTrails && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.tint} />
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
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
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
    fontSize: 17,
    fontWeight: '600',
  },
  trailCount: {
    fontSize: 13,
    marginTop: 2,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
  },
  filterButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
