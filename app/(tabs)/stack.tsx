import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from "react-native";
import MapView, { Polyline, type Region } from "react-native-maps";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, Fonts } from "@/constants/theme";
import * as Location from "expo-location";
import { getTrailCount, getSetting } from "@/lib/db";
import { useTrails } from "@/hooks/use-trails";
import { smoothCoordinates, type Trail } from "@/lib/geo";
import { setExportData } from "@/lib/export-store";
import {
  getFilters,
  subscribeFilters,
  hasActiveFilters,
} from "@/lib/filter-store";

const TRAIL_WIDTH = 3;
const EXPORT_ASPECT_RATIO = 3 / 4; // 3:4 poster aspect

export default function StackScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const db = useSQLiteContext();
  const [hasTrails, setHasTrails] = useState(true);
  const [showLocation, setShowLocation] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getTrailCount(db).then((count) => setHasTrails(count > 0));
      getSetting(db, "showLocation")
        .then(async (v) => {
          if (v === "true") {
            const { status } = await Location.getForegroundPermissionsAsync();
            setShowLocation(status === "granted");
          } else {
            setShowLocation(false);
          }
        })
        .catch(() => {});
    }, [db]),
  );

  const filters = useSyncExternalStore(subscribeFilters, getFilters);
  const { startDate, endDate, areaLabels: filterLabels, areaLabel } = filters;
  const filtersActive = hasActiveFilters();

  // "Ring the bell" nudge animation for filter button when no area selected
  const shakeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!filtersActive && hasTrails) {
      const ring = Animated.sequence([
        Animated.timing(shakeAnim, {
          toValue: 12,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -10,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 8,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -4,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 0,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.delay(3000),
      ]);
      const loop = Animated.loop(ring);
      loop.start();
      return () => loop.stop();
    } else {
      shakeAnim.setValue(0);
    }
  }, [filtersActive, hasTrails, shakeAnim]);

  const { clusters, loading, loadClusterTrails } = useTrails({
    startDate,
    endDate,
    labels: filterLabels ?? [],
  });

  const selectedCluster = useMemo(
    () => (clusters.length > 0 ? clusters[0] : null),
    [clusters],
  );

  const [renderedTrails, setRenderedTrails] = useState<Trail[]>([]);
  const [loadingTrails, setLoadingTrails] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

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

    return () => {
      cancelled = true;
    };
  }, [selectedCluster, loadClusterTrails]);

  const openFilters = useCallback(() => {
    router.push("/filter-modal");
  }, [router]);

  const openExport = useCallback(async () => {
    let heading = 0;
    if (mapRef.current) {
      try {
        const camera = await mapRef.current.getCamera();
        heading = camera.heading || 0;
      } catch {}
    }
    setExportData(renderedTrails, areaLabel ?? "", mapRegion, heading);
    router.push("/export-modal");
  }, [router, renderedTrails, areaLabel, mapRegion]);

  const totalInCluster = selectedCluster?.summaries.length ?? 0;

  // Calculate export frame: largest 3:4 rectangle centered in the map container
  const exportFrame = useMemo(() => {
    const cw = containerSize.width;
    const ch = containerSize.height;
    if (cw === 0 || ch === 0) return { width: 0, height: 0, top: 0, left: 0 };

    const containerAspect = cw / ch;

    if (containerAspect < EXPORT_ASPECT_RATIO) {
      // Container is narrower than 3:4 — full width, crop height
      const fh = cw / EXPORT_ASPECT_RATIO;
      return { width: cw, height: fh, top: (ch - fh) / 2, left: 0 };
    }
    // Container is wider than 3:4 — full height, crop width
    const fw = ch * EXPORT_ASPECT_RATIO;
    return { width: fw, height: ch, top: 0, left: (cw - fw) / 2 };
  }, [containerSize]);

  if (!hasTrails) {
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
          Import your workouts first to stack them on the map.
        </Text>
        <TouchableOpacity
          style={[
            styles.emptyButton,
            {
              backgroundColor: colors.accent,
              borderColor: colors.activeSelectionBorder,
            },
          ]}
          onPress={() => router.push("/(tabs)/settings")}
        >
          <Text style={[styles.emptyButtonText, { color: colors.text }]}>
            Import Workouts
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setContainerSize({ width, height });
      }}
    >
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        mapType="mutedStandard"
        userInterfaceStyle={colorScheme}
        showsCompass={false}
        showsScale={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        pitchEnabled={false}
        showsUserLocation={showLocation}
        legalLabelInsets={{ top: 0, left: 0, bottom: 10, right: 10 }}
        onRegionChangeComplete={setMapRegion}
      >
        {renderedTrails.map((trail) => (
          <Polyline
            key={trail.workoutId}
            coordinates={smoothCoordinates(trail.coordinates)}
            strokeColor={colors.trailStrokeStacked}
            strokeWidth={TRAIL_WIDTH}
            lineCap="round"
            lineJoin="round"
          />
        ))}
      </MapView>

      {/* Export frame preview overlay */}
      <View
        style={[
          styles.exportFrame,
          {
            width: exportFrame.width,
            height: exportFrame.height,
            top: exportFrame.top,
            left: exportFrame.left,
            borderColor: colors.text,
          },
        ]}
        pointerEvents="none"
      />

      {/* Floating capsule top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View
          style={[
            styles.topCapsule,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 2,
            },
          ]}
        >
          <View style={styles.topInfo}>
            <Text
              style={[styles.clusterLabel, { color: colors.text }]}
              numberOfLines={1}
            >
              {areaLabel ?? "Select an area"}
            </Text>
            <Text style={[styles.trailCount, { color: colors.textSecondary }]}>
              {!filtersActive
                ? "Tap filter to choose"
                : loading || loadingTrails
                  ? "Loading..."
                  : `${renderedTrails.length}${totalInCluster > renderedTrails.length ? ` of ${totalInCluster}` : ""} trails`}
            </Text>
          </View>
          <View style={styles.topActions}>
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: shakeAnim.interpolate({
                      inputRange: [-15, 15],
                      outputRange: ["-15deg", "15deg"],
                    }),
                  },
                ],
              }}
            >
              <TouchableOpacity
                style={[
                  styles.actionCircle,
                  {
                    backgroundColor: colors.surface,
                    borderWidth: 2,
                    borderColor: colors.activeSelectionBorder,
                  },
                ]}
                onPress={openFilters}
              >
                <Feather name="filter" size={20} color={colors.text} />
              </TouchableOpacity>
            </Animated.View>
            <TouchableOpacity
              style={[
                styles.actionCircle,
                {
                  backgroundColor: colors.accent,
                  borderWidth: 2,
                  borderColor: colors.activeSelectionBorder,
                  opacity: renderedTrails.length === 0 ? 0.4 : 1,
                },
              ]}
              onPress={openExport}
              disabled={renderedTrails.length === 0}
            >
              <Feather name="image" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {!filtersActive && !loadingTrails && (
        <View
          style={[
            styles.loadingOverlay,
            { backgroundColor: `${colors.background}80` },
          ]}
          pointerEvents="none"
        >
          <Feather name="map-pin" size={36} color={colors.textSecondary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Select an area to see trails
          </Text>
        </View>
      )}

      {loadingTrails && (
        <View
          style={[
            styles.loadingOverlay,
            { backgroundColor: `${colors.background}80` },
          ]}
        >
          <ActivityIndicator size="large" color={colors.accent} />
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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
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
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  topCapsule: {
    marginHorizontal: 16,
    borderRadius: 999,
    borderWidth: 2,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 20,
    paddingRight: 12,
    paddingVertical: 12,
  },
  topInfo: {
    flex: 1,
    marginRight: 10,
  },
  topActions: {
    flexDirection: "row",
    gap: 8,
  },
  clusterLabel: {
    fontFamily: Fonts.semibold,
    fontSize: 16,
  },
  trailCount: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    marginTop: 1,
  },
  actionCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  exportFrame: {
    position: "absolute",
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderStyle: "dotted",
    opacity: 0.25,
  },
});
