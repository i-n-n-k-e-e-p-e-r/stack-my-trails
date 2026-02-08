import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useTrails } from '@/hooks/use-trails';
import { bboxCenter } from '@/lib/geo';
import { getCachedLabel, setCachedLabel } from '@/lib/db';
import type { Trail } from '@/lib/geo';

const TRAIL_WIDTH = 3;

export default function StackScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const db = useSQLiteContext();

  const params = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
    clusterId?: string;
  }>();

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d;
  });
  const [endDate, setEndDate] = useState(() => new Date());
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  useEffect(() => {
    if (params.startDate) setStartDate(new Date(params.startDate));
    if (params.endDate) setEndDate(new Date(params.endDate));
    if (params.clusterId) setSelectedClusterId(params.clusterId);
  }, [params.startDate, params.endDate, params.clusterId]);

  const { clusters, loading, loadClusterTrails } = useTrails({ startDate, endDate });

  // Auto-select first cluster
  useEffect(() => {
    if (clusters.length > 0 && !selectedClusterId) {
      setSelectedClusterId(clusters[0].id);
    }
  }, [clusters, selectedClusterId]);

  const selectedCluster = useMemo(
    () => clusters.find((c) => c.id === selectedClusterId) ?? null,
    [clusters, selectedClusterId],
  );

  // Load coordinates on demand for selected cluster
  const [renderedTrails, setRenderedTrails] = useState<Trail[]>([]);
  const [loadingTrails, setLoadingTrails] = useState(false);

  useEffect(() => {
    if (!selectedCluster) {
      setRenderedTrails([]);
      return;
    }

    let cancelled = false;
    setLoadingTrails(true);

    loadClusterTrails(selectedCluster).then((trails) => {
      if (!cancelled) {
        setRenderedTrails(trails);
        setLoadingTrails(false);

        // Fit map to loaded coordinates
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

  // Resolve cluster labels
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!mapRef.current || clusters.length === 0) return;
    let cancelled = false;

    async function labelAll() {
      let updated = false;
      for (const cluster of clusters) {
        if (cluster.label || cancelled) continue;
        const center = bboxCenter(cluster.boundingBox);
        const cached = await getCachedLabel(db, center.latitude, center.longitude);
        if (cached) {
          cluster.label = cached;
          updated = true;
          continue;
        }
        try {
          const address = await mapRef.current!.addressForCoordinate(center);
          const parts = [address.locality, address.administrativeArea]
              .filter((v) => v && v !== 'null');
          const label = parts.length > 0 ? parts.join(', ') : address.name || 'Unknown';
          cluster.label = label;
          await setCachedLabel(db, center.latitude, center.longitude, label);
          updated = true;
        } catch {
          cluster.label = `${center.latitude.toFixed(1)}, ${center.longitude.toFixed(1)}`;
          updated = true;
        }
      }
      if (!cancelled && updated) forceUpdate((n) => n + 1);
    }

    labelAll();
    return () => { cancelled = true; };
  }, [clusters, db]);

  const openFilters = useCallback(() => {
    router.push({
      pathname: '/filter-modal',
      params: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        clusterId: selectedClusterId ?? '',
      },
    });
  }, [router, startDate, endDate, selectedClusterId]);

  const totalInCluster = selectedCluster?.summaries.length ?? 0;

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
                {selectedCluster?.label ?? 'Select an area'}
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
