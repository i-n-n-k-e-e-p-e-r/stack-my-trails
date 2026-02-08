import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useTrails } from '@/hooks/use-trails';
import { useImportTrails } from '@/hooks/use-import-trails';
import { DateRangePicker } from '@/components/date-range-picker';
import { AreaPicker } from '@/components/area-picker';
import { bboxCenter } from '@/lib/geo';
import { getCachedLabel, setCachedLabel, getTrailCount } from '@/lib/db';
import type { TrailCluster } from '@/lib/geo';

const TRAIL_COLOR = 'rgba(255, 59, 48, 0.35)';
const TRAIL_WIDTH = 2.5;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const mapRef = useRef<MapView>(null);
  const db = useSQLiteContext();

  // Date range — default to last 6 months
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d;
  });
  const [endDate, setEndDate] = useState(() => new Date());

  // Import hook
  const { importing, progress, total, error: importError, startImport } =
    useImportTrails();

  // Trail data from SQLite
  const { clusters, loading, error, refresh } = useTrails({
    startDate,
    endDate,
  });

  // Trail count for display
  const [trailCount, setTrailCount] = useState(0);
  useEffect(() => {
    getTrailCount(db).then(setTrailCount);
  }, [db, importing]);

  // Refresh trails when import finishes
  const wasImporting = useRef(false);
  useEffect(() => {
    if (wasImporting.current && !importing) {
      refresh();
      getTrailCount(db).then(setTrailCount);
    }
    wasImporting.current = importing;
  }, [importing, refresh, db]);

  // Selected cluster
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(
    null,
  );

  // Auto-select first cluster when clusters change
  useEffect(() => {
    if (clusters.length > 0 && !selectedClusterId) {
      setSelectedClusterId(clusters[0].id);
    }
  }, [clusters, selectedClusterId]);

  const selectedCluster = useMemo(
    () => clusters.find((c) => c.id === selectedClusterId) ?? null,
    [clusters, selectedClusterId],
  );

  // Resolve cluster labels (cached in SQLite)
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!mapRef.current || clusters.length === 0) return;

    let cancelled = false;

    async function labelAll() {
      let updated = false;
      for (const cluster of clusters) {
        if (cluster.label || cancelled) continue;
        const center = bboxCenter(cluster.boundingBox);

        // Check SQLite cache first
        const cached = await getCachedLabel(db, center.latitude, center.longitude);
        if (cached) {
          cluster.label = cached;
          updated = true;
          continue;
        }

        // Reverse geocode and cache
        try {
          const address = await mapRef.current!.addressForCoordinate(center);
          const label =
            [address.locality, address.administrativeArea]
              .filter(Boolean)
              .join(', ') || address.name;
          cluster.label = label;
          await setCachedLabel(db, center.latitude, center.longitude, label);
          updated = true;
        } catch {
          const label = `${center.latitude.toFixed(1)}, ${center.longitude.toFixed(1)}`;
          cluster.label = label;
          updated = true;
        }
      }
      if (!cancelled && updated) forceUpdate((n) => n + 1);
    }

    labelAll();
    return () => {
      cancelled = true;
    };
  }, [clusters, db]);

  // Fit map to selected cluster
  const fitToCluster = useCallback((cluster: TrailCluster) => {
    const allCoords = cluster.trails.flatMap((t) => t.coordinates);
    if (allCoords.length === 0) return;
    mapRef.current?.fitToCoordinates(allCoords, {
      edgePadding: { top: 80, right: 40, bottom: 80, left: 40 },
      animated: true,
    });
  }, []);

  useEffect(() => {
    if (selectedCluster) {
      const timer = setTimeout(() => fitToCluster(selectedCluster), 300);
      return () => clearTimeout(timer);
    }
  }, [selectedCluster, fitToCluster]);

  const handleAreaSelect = useCallback((id: string) => {
    setSelectedClusterId(id);
  }, []);

  const handleDateRangeChange = useCallback((start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
    setSelectedClusterId(null);
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        mapType="mutedStandard"
        showsUserLocation={false}
        showsCompass={true}
        showsScale={true}
        pitchEnabled={false}>
        {selectedCluster?.trails.map((trail) => (
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

      {/* Controls overlay */}
      <View style={[styles.overlay, { paddingTop: insets.top + 8 }]}>
        <View
          style={[
            styles.controlsCard,
            {
              backgroundColor:
                colorScheme === 'dark'
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
          {/* Stats + Import row */}
          <View style={styles.bottomRow}>
            <Text style={[styles.statsText, { color: colors.icon }]}>
              {loading
                ? 'Loading...'
                : `${selectedCluster?.trails.length ?? 0} trails shown · ${trailCount} total`}
            </Text>
            <TouchableOpacity
              style={[styles.importButton, { backgroundColor: colors.tint }]}
              onPress={startImport}
              disabled={importing}>
              <Text style={styles.importButtonText}>
                {importing ? 'Importing...' : 'Import'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Import progress overlay */}
      {importing && (
        <View style={styles.progressOverlay}>
          <View
            style={[
              styles.progressCard,
              {
                backgroundColor:
                  colorScheme === 'dark'
                    ? 'rgba(21, 23, 24, 0.95)'
                    : 'rgba(255, 255, 255, 0.95)',
              },
            ]}>
            <Text style={[styles.progressTitle, { color: colors.text }]}>
              Importing from Health
            </Text>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: colors.tint,
                    width: total > 0 ? `${(progress / total) * 100}%` : '0%',
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.icon }]}>
              {total > 0
                ? `${progress} / ${total} workouts`
                : 'Fetching workouts...'}
            </Text>
          </View>
        </View>
      )}

      {/* Error display */}
      {(error || importError) && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{error || importError}</Text>
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
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  statsText: {
    fontSize: 12,
    flex: 1,
  },
  importButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    marginLeft: 8,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 10,
  },
  progressCard: {
    width: 280,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  progressTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 16,
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    marginTop: 10,
  },
  errorOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    borderRadius: 12,
    padding: 16,
    zIndex: 5,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
});
