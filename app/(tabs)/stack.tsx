import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import MapView, { Polyline, type Region } from "react-native-maps";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, Fonts } from "@/constants/theme";
import { getTrailCount } from "@/lib/db";
import { useTrails } from "@/hooks/use-trails";
import { smoothCoordinates, type Trail } from "@/lib/geo";
import { setExportData } from "@/lib/export-store";

const TRAIL_WIDTH = 3;
const EXPORT_ASPECT_RATIO = 3 / 4; // 3:4 poster aspect

export default function StackScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const dimensions = useWindowDimensions();
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
  const [mapRegion, setMapRegion] = useState<Region | null>(null);

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
    router.push({
      pathname: "/filter-modal",
      params: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        areaLabels: filterLabels ? JSON.stringify(filterLabels) : "",
        areaLabel: areaLabel ?? "",
      },
    });
  }, [router, startDate, endDate, filterLabels, areaLabel]);

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

  // Calculate export frame dimensions (3:4 aspect ratio)
  const exportFrame = useMemo(() => {
    const screenWidth = dimensions.width;
    const screenHeight = dimensions.height;
    const screenAspect = screenWidth / screenHeight;

    if (screenAspect < EXPORT_ASPECT_RATIO) {
      // Screen is more portrait than poster — crop height
      const frameHeight = screenWidth / EXPORT_ASPECT_RATIO;
      return {
        width: screenWidth,
        height: frameHeight,
        top: (screenHeight - frameHeight) / 2,
        left: 0,
      };
    } else {
      // Screen is wider than poster — crop width
      const frameWidth = screenHeight * EXPORT_ASPECT_RATIO;
      return {
        width: frameWidth,
        height: screenHeight,
        top: 0,
        left: (screenWidth - frameWidth) / 2,
      };
    }
  }, [dimensions]);

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
          style={[styles.emptyButton, { backgroundColor: colors.accent }]}
          onPress={() => router.push("/(tabs)/settings")}
        >
          <Text style={[styles.emptyButtonText, { color: colors.buttonText }]}>
            Go to Settings
          </Text>
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
        showsCompass={false}
        showsScale={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        pitchEnabled={false}
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
              {loading || loadingTrails
                ? "Loading..."
                : `${renderedTrails.length}${totalInCluster > renderedTrails.length ? ` of ${totalInCluster}` : ""} trails`}
            </Text>
          </View>
          <View style={styles.topActions}>
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
              <Feather name="download" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

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
