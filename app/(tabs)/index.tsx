import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import {
  getAllTrailSummaries,
  getTrailCoordinates,
  getCachedLabel,
  setCachedLabel,
} from '@/lib/db';
import { bboxCenter } from '@/lib/geo';
import type { TrailSummary, Coordinate } from '@/lib/geo';

const ACTIVITY_LABELS: Record<number, string> = {
  13: 'Cycling',
  24: 'Hiking',
  37: 'Running',
  52: 'Walking',
};

const ACTIVITY_ICONS: Record<number, string> = {
  13: '\u{1F6B2}',
  24: '\u{26F0}',
  37: '\u{1F3C3}',
  52: '\u{1F6B6}',
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
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTemp(celsius: number | null | undefined): string | null {
  if (celsius == null) return null;
  return `${Math.round(celsius)}\u00B0C`;
}

export default function TrailsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const mapRef = useRef<MapView>(null);
  const db = useSQLiteContext();

  const [trails, setTrails] = useState<TrailSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCoords, setSelectedCoords] = useState<Coordinate[]>([]);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());

  // Load summaries only — no coordinates
  useEffect(() => {
    getAllTrailSummaries(db).then((data) => {
      setTrails(data);
      if (data.length > 0) {
        setSelectedId(data[0].workoutId);
      }
    });
  }, [db]);

  const selectedTrail = trails.find((t) => t.workoutId === selectedId) ?? null;

  // Load coordinates only for the selected trail
  useEffect(() => {
    if (!selectedId) {
      setSelectedCoords([]);
      return;
    }
    getTrailCoordinates(db, selectedId).then(setSelectedCoords);
  }, [db, selectedId]);

  // Fit map to selected trail
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

  // Resolve location labels
  useEffect(() => {
    if (!mapRef.current || trails.length === 0) return;
    let cancelled = false;

    async function resolveLabels() {
      const newLabels = new Map(labels);
      for (const trail of trails) {
        if (newLabels.has(trail.workoutId) || cancelled) continue;
        const center = bboxCenter(trail.boundingBox);

        const cached = await getCachedLabel(db, center.latitude, center.longitude);
        if (cached) {
          newLabels.set(trail.workoutId, cached);
          continue;
        }

        try {
          const address = await mapRef.current!.addressForCoordinate(center);
          const label =
            [address.locality, address.administrativeArea]
              .filter(Boolean)
              .join(', ') || address.name;
          newLabels.set(trail.workoutId, label);
          await setCachedLabel(db, center.latitude, center.longitude, label);
        } catch {
          newLabels.set(
            trail.workoutId,
            `${center.latitude.toFixed(1)}, ${center.longitude.toFixed(1)}`,
          );
        }
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
            styles.trailRow,
            {
              backgroundColor: isActive
                ? colorScheme === 'dark'
                  ? '#1c2a33'
                  : '#e8f4fd'
                : 'transparent',
            },
          ]}
          onPress={() => handleSelect(item.workoutId)}
          activeOpacity={0.6}>
          <Text style={styles.activityIcon}>
            {ACTIVITY_ICONS[item.activityType] ?? '\u{1F3C3}'}
          </Text>
          <View style={styles.trailInfo}>
            <Text
              style={[styles.trailDate, { color: colors.text }]}
              numberOfLines={1}>
              {formatDate(item.startDate)}
              {' \u00B7 '}
              {ACTIVITY_LABELS[item.activityType] ?? 'Workout'}
              {' \u00B7 '}
              {formatDuration(item.duration)}
            </Text>
            <Text
              style={[styles.trailPlace, { color: colors.icon }]}
              numberOfLines={1}>
              {label ?? 'Loading...'}
              {temp ? ` \u00B7 ${temp}` : ''}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [selectedId, labels, colors, colorScheme, handleSelect],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Preview map — top half */}
      <View style={[styles.mapContainer, { paddingTop: insets.top }]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          mapType="mutedStandard"
          showsCompass={false}
          pitchEnabled={false}
          rotateEnabled={false}>
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

        {/* Trail info overlay */}
        {selectedTrail && (
          <View style={styles.mapOverlay}>
            <View
              style={[
                styles.mapInfoCard,
                {
                  backgroundColor:
                    colorScheme === 'dark'
                      ? 'rgba(21, 23, 24, 0.85)'
                      : 'rgba(255, 255, 255, 0.85)',
                },
              ]}>
              <Text
                style={[styles.mapInfoTitle, { color: colors.text }]}
                numberOfLines={1}>
                {labels.get(selectedTrail.workoutId) ?? '...'}
              </Text>
              <Text style={[styles.mapInfoSub, { color: colors.icon }]}>
                {formatDate(selectedTrail.startDate)}
                {formatTemp(selectedTrail.temperature)
                  ? ` \u00B7 ${formatTemp(selectedTrail.temperature)}`
                  : ''}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Trail list — bottom half */}
      <View style={styles.listContainer}>
        <View
          style={[
            styles.listHeader,
            {
              borderBottomColor:
                colorScheme === 'dark' ? '#2a2d2e' : '#e5e5e5',
            },
          ]}>
          <Text style={[styles.listTitle, { color: colors.text }]}>
            {trails.length} Trails
          </Text>
        </View>
        <FlatList
          data={trails}
          keyExtractor={(item) => item.workoutId}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
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
  mapContainer: {
    height: '45%',
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  mapInfoCard: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  mapInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  mapInfoSub: {
    fontSize: 13,
    marginTop: 2,
  },
  listContainer: {
    flex: 1,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  trailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  activityIcon: {
    fontSize: 24,
  },
  trailInfo: {
    flex: 1,
  },
  trailDate: {
    fontSize: 15,
    fontWeight: '500',
  },
  trailPlace: {
    fontSize: 13,
    marginTop: 2,
  },
});
