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
import { getAllTrailSummaries, getTrailCoordinates } from "@/lib/db";
import { resolveLabel } from "@/lib/geocode";
import { bboxCenter, smoothCoordinates } from "@/lib/geo";
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
  const mapReady = useRef(false);

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

  const fitMap = useCallback(() => {
    if (!mapReady.current || selectedCoords.length === 0) return;
    mapRef.current?.fitToCoordinates(selectedCoords, {
      edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
      animated: true,
    });
  }, [selectedCoords]);

  useEffect(() => {
    if (selectedCoords.length === 0) return;
    const timer = setTimeout(fitMap, 200);
    return () => clearTimeout(timer);
  }, [selectedCoords, fitMap]);

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
              backgroundColor: isActive ? colors.accent : colors.surface,
              borderColor: isActive
                ? colors.activeSelectionBorder
                : colors.border,
              borderWidth: 2,
            },
          ]}
          onPress={() => handleSelect(item.workoutId)}
          activeOpacity={0.7}
        >
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
                  style={[styles.trailSubtitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {label ?? "Loading..."}
                </Text>
              </View>
            </View>
            <View style={styles.pillRow}>
              <View style={[styles.pill, { backgroundColor: colors.text }]}>
                <Text style={[styles.pillText, { color: colors.surface }]}>
                  {formatDuration(item.duration)}
                </Text>
              </View>
              {temp && (
                <View
                  style={[
                    styles.pill,
                    { borderColor: colors.text, borderWidth: 1 },
                  ]}
                >
                  <Text style={[styles.pillText, { color: colors.text }]}>
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
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading trails...
        </Text>
      </View>
    );
  }

  if (trails.length === 0) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: colors.background },
        ]}
      >
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          No trails yet
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          Import your workouts to see them here.
        </Text>
        <TouchableOpacity
          style={[styles.emptyButton, { backgroundColor: colors.accent }]}
          onPress={() => router.push("/(tabs)/settings")}
        >
          <Text style={[styles.emptyButtonText, { color: colors.buttonText }]}>
            Import workouts
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Preview map — top half */}
      <View
        style={[
          styles.mapContainer,
          {
            paddingTop: insets.top,
            borderBottomWidth: 2,
            borderColor: colors.border,
          },
        ]}
      >
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          mapType="mutedStandard"
          userInterfaceStyle={colorScheme}
          showsCompass={false}
          showsPointsOfInterest={false}
          showsBuildings={false}
          pitchEnabled={false}
          rotateEnabled={false}
          onMapReady={() => {
            mapReady.current = true;
            fitMap();
          }}
        >
          {selectedCoords.length > 0 && (
            <Polyline
              coordinates={smoothCoordinates(selectedCoords)}
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
            paddingBottom: insets.bottom + 80,
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
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 2,
  },
  emptyButtonText: {
    fontFamily: Fonts.semibold,
    fontSize: 16,
  },
  mapContainer: {
    height: "40%",
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
    borderRadius: 32,
    overflow: "hidden",
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
    borderRadius: 999,
  },
  pillText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
  },
});
