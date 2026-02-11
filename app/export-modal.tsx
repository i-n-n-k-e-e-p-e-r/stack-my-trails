import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from "react-native";
import MapView, { type LatLng, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Canvas,
  Picture,
  createPicture,
  useTypeface,
} from "@shopify/react-native-skia";
import type { SkPath } from "@shopify/react-native-skia";
import Slider from "@react-native-community/slider";
import * as MediaLibrary from "expo-media-library";
import ViewShot, { captureRef } from "react-native-view-shot";
import { Feather } from "@expo/vector-icons";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, Fonts } from "@/constants/theme";
import { getExportData, clearExportData } from "@/lib/export-store";
import { computeBoundingBox } from "@/lib/geo";
import {
  POSTER_THEMES,
  buildTransform,
  buildTrailPaths,
  drawPoster,
  cropRegionToAspect,
  type PosterTheme,
} from "@/lib/poster-renderer";

const INTENSITY_MIN_STROKE = 1.0;
const INTENSITY_MAX_STROKE = 4.0;
const INTENSITY_MIN_OPACITY = 0.15;
const INTENSITY_MAX_OPACITY = 0.5;
const INTENSITY_DEFAULT = 0.4;

const CANVAS_ASPECT = 3 / 4;

export default function ExportModal() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const router = useRouter();
  const viewShotRef = useRef<ViewShot>(null);
  const posterMapRef = useRef<MapView>(null);

  const typeface = useTypeface(require("../assets/fonts/Geist-Bold.otf"));

  const { trails, areaLabel, visibleRegion } = useMemo(
    () => getExportData(),
    [],
  );

  const [selectedTheme, setSelectedTheme] = useState<PosterTheme>(
    POSTER_THEMES[2],
  );
  const [intensity, setIntensity] = useState(INTENSITY_DEFAULT);
  const [showLabel, setShowLabel] = useState(true);
  const [showMap, setShowMap] = useState(true);
  const [labelText, setLabelText] = useState(() => {
    const city = areaLabel || "MY CITY";
    const year = new Date().getFullYear();
    return `${city.toUpperCase()} \u2014 ${year}`;
  });
  const [exporting, setExporting] = useState(false);

  const strokeWidth =
    INTENSITY_MIN_STROKE +
    intensity * (INTENSITY_MAX_STROKE - INTENSITY_MIN_STROKE);
  const opacity =
    INTENSITY_MIN_OPACITY +
    intensity * (INTENSITY_MAX_OPACITY - INTENSITY_MIN_OPACITY);

  // Poster container size — used to fit poster within available space
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const canvasWidth = useMemo(() => {
    if (containerSize.width === 0 || containerSize.height === 0) return 0;
    const maxW = containerSize.width - 32;
    const maxH = containerSize.height - 16;
    const wFromWidth = maxW;
    const hFromWidth = maxW / CANVAS_ASPECT;
    if (hFromWidth <= maxH) return wFromWidth;
    return maxH * CANVAS_ASPECT;
  }, [containerSize]);
  const canvasHeight = canvasWidth / CANVAS_ASPECT;

  // Exact map bounds for pixel-perfect alignment
  const [posterBounds, setPosterBounds] = useState<{
    northEast: LatLng;
    southWest: LatLng;
  } | null>(null);

  const handleMapRegionChange = useCallback(async () => {
    if (!posterMapRef.current) return;
    try {
      const bounds = await posterMapRef.current.getMapBoundaries();
      setPosterBounds(bounds);
    } catch {}
  }, []);

  // Crop the Stack screen region to poster 3:4 aspect ratio
  const initialMapRegion = useMemo((): Region | undefined => {
    let region: Region | undefined;
    if (visibleRegion) {
      region = visibleRegion;
    } else {
      const allCoords = trails.flatMap((t) => t.coordinates);
      if (allCoords.length === 0) return undefined;
      const bbox = computeBoundingBox(allCoords);
      const latDelta = (bbox.maxLat - bbox.minLat) * 1.3 || 0.01;
      const lngDelta = (bbox.maxLng - bbox.minLng) * 1.3 || 0.01;
      region = {
        latitude: (bbox.minLat + bbox.maxLat) / 2,
        longitude: (bbox.minLng + bbox.maxLng) / 2,
        latitudeDelta: latDelta,
        longitudeDelta: lngDelta,
      };
    }
    return cropRegionToAspect(region, CANVAS_ASPECT);
  }, [trails, visibleRegion]);

  useEffect(() => clearExportData, []);

  const transformRegion = useMemo((): Region | null => {
    if (posterBounds) {
      return {
        latitude:
          (posterBounds.northEast.latitude + posterBounds.southWest.latitude) /
          2,
        longitude:
          (posterBounds.northEast.longitude +
            posterBounds.southWest.longitude) /
          2,
        latitudeDelta:
          posterBounds.northEast.latitude - posterBounds.southWest.latitude,
        longitudeDelta:
          posterBounds.northEast.longitude - posterBounds.southWest.longitude,
      };
    }
    return initialMapRegion ?? visibleRegion;
  }, [posterBounds, initialMapRegion, visibleRegion]);

  const paths: SkPath[] = useMemo(() => {
    if (canvasWidth === 0 || trails.length === 0) return [];
    const padding = showMap ? 0 : 0.04;
    const transform = buildTransform(
      trails,
      canvasWidth,
      canvasHeight,
      transformRegion,
      padding,
    );
    return buildTrailPaths(trails, transform);
  }, [canvasWidth, canvasHeight, trails, transformRegion, showMap]);

  const picture = useMemo(() => {
    if (paths.length === 0 || canvasWidth === 0) return null;
    const w = canvasWidth;
    const h = canvasHeight;
    return createPicture(
      (canvas) => {
        drawPoster(canvas, w, h, paths, {
          theme: selectedTheme,
          strokeWidth,
          opacity,
          showLabel,
          labelText,
          typeface,
        });
      },
      { width: w, height: h },
    );
  }, [
    paths,
    canvasWidth,
    canvasHeight,
    selectedTheme,
    strokeWidth,
    opacity,
    showLabel,
    labelText,
    typeface,
  ]);

  const captureHighRes = useCallback(async () => {
    if (!viewShotRef.current) return null;
    return captureRef(viewShotRef, {
      format: "png",
      quality: 1,
      result: "tmpfile",
      width: canvasWidth * 3,
      height: canvasHeight * 3,
    });
  }, [canvasWidth, canvasHeight]);

  const handleSave = useCallback(async () => {
    setExporting(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please allow access to save photos.",
        );
        return;
      }
      const uri = await captureHighRes();
      if (!uri) return;
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert("Saved", "Poster saved to your photo library.");
    } catch {
      Alert.alert("Error", "Failed to save poster.");
    } finally {
      setExporting(false);
    }
  }, [captureHighRes]);

  const handleShare = useCallback(async () => {
    setExporting(true);
    try {
      const uri = await captureHighRes();
      if (!uri) return;
      await Share.share({ url: uri });
    } catch {
      // User cancelled
    } finally {
      setExporting(false);
    }
  }, [captureHighRes]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, borderBottomColor: colors.borderLight },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.text }]}>Export</Text>
        <TouchableOpacity
          style={[styles.closeButton, { borderColor: colors.border }]}
          onPress={() => router.back()}
        >
          <Feather name="x" size={16} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Options row: map + label toggles + input */}
      <View style={styles.optionsRow}>
        <TouchableOpacity
          style={[
            styles.optionCircle,
            {
              backgroundColor: showMap ? colors.accent : "transparent",
              borderColor: showMap
                ? colors.activeSelectionBorder
                : colors.borderLight,
              borderWidth: showMap ? 2 : 1.5,
            },
          ]}
          onPress={() => setShowMap(!showMap)}
        >
          <Feather
            name="map"
            size={18}
            color={showMap ? colors.text : colors.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.optionCircle,
            {
              backgroundColor: showLabel ? colors.accent : "transparent",
              borderColor: showLabel
                ? colors.activeSelectionBorder
                : colors.borderLight,
              borderWidth: showLabel ? 2 : 1.5,
            },
          ]}
          onPress={() => setShowLabel(!showLabel)}
        >
          <Feather
            name="type"
            size={18}
            color={showLabel ? colors.text : colors.textSecondary}
          />
        </TouchableOpacity>

        <TextInput
          style={[
            styles.labelInput,
            {
              color: colors.text,
              borderColor: showLabel ? colors.border : colors.borderLight,
              opacity: showLabel ? 1 : 0.3,
            },
          ]}
          value={labelText}
          onChangeText={setLabelText}
          editable={showLabel}
          placeholder="Label text"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          returnKeyType="done"
        />
      </View>

      {/* Poster Preview — flex: 1 takes remaining space */}
      <View
        style={styles.canvasContainer}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setContainerSize({ width, height });
        }}
      >
        {canvasWidth > 0 && trails.length > 0 && initialMapRegion && (
          <ViewShot
            ref={viewShotRef}
            options={{ format: "png", quality: 1 }}
            style={[
              styles.canvasWrapper,
              {
                width: canvasWidth,
                height: canvasHeight,
                borderColor: colors.borderLight,
              },
            ]}
          >
            {showMap ? (
              <>
                <MapView
                  ref={posterMapRef}
                  style={StyleSheet.absoluteFill}
                  initialRegion={initialMapRegion}
                  mapType="mutedStandard"
                  userInterfaceStyle={selectedTheme.mapStyle}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  showsCompass={false}
                  showsScale={false}
                  showsPointsOfInterest={false}
                  showsBuildings={false}
                  showsUserLocation={false}
                  showsTraffic={false}
                  showsIndoors={false}
                  onRegionChangeComplete={handleMapRegionChange}
                />
                {selectedTheme.tintOpacity > 0 && (
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        backgroundColor: selectedTheme.tintColor,
                        opacity: selectedTheme.tintOpacity,
                      },
                    ]}
                  />
                )}
              </>
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: selectedTheme.tintColor },
                ]}
              />
            )}

            <Canvas
              opaque={false}
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "transparent" },
              ]}
            >
              {picture && <Picture picture={picture} />}
            </Canvas>
          </ViewShot>
        )}

        {trails.length === 0 && (
          <View
            style={[styles.emptyCanvas, { borderColor: colors.borderLight }]}
          >
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No trails to export
            </Text>
          </View>
        )}
      </View>

      {/* Theme selector — centered under preview */}
      <View style={styles.themeRow}>
        {POSTER_THEMES.map((theme) => {
          const active = selectedTheme.id === theme.id;
          return (
            <View key={theme.id} style={styles.themeItem}>
              <TouchableOpacity
                style={[
                  styles.themeCircle,
                  {
                    backgroundColor: active ? colors.accent : theme.tintColor,
                    borderColor: active
                      ? colors.activeSelectionBorder
                      : colors.borderLight,
                    borderWidth: active ? 2 : 1.5,
                  },
                ]}
                onPress={() => setSelectedTheme(theme)}
              >
                <Feather
                  name="image"
                  size={16}
                  color={active ? colors.buttonText : theme.trailColor}
                />
              </TouchableOpacity>
              <Text
                style={[
                  styles.themeLabel,
                  { color: active ? colors.text : colors.textSecondary },
                ]}
              >
                {theme.name}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Intensity slider — centered */}
      <View style={styles.intensityRow}>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          value={intensity}
          onValueChange={setIntensity}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.borderLight}
          thumbTintColor={colors.accent}
        />
      </View>

      {/* Fixed bottom buttons */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom }]}>
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              {
                backgroundColor: colors.accent,
                borderColor: colors.activeSelectionBorder,
                opacity: exporting || trails.length === 0 ? 0.4 : 1,
              },
            ]}
            onPress={handleSave}
            disabled={exporting || trails.length === 0}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={colors.buttonText} />
            ) : (
              <>
                <Feather name="download" size={18} color={colors.text} />
                <Text style={[styles.buttonText, { color: colors.text }]}>
                  Save
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              {
                borderColor: colors.border,
                opacity: exporting || trails.length === 0 ? 0.4 : 1,
              },
            ]}
            onPress={handleShare}
            disabled={exporting || trails.length === 0}
          >
            <Feather name="share" size={18} color={colors.text} />
            <Text style={[styles.buttonText, { color: colors.text }]}>
              Share
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: Fonts.semibold,
    fontSize: 18,
  },
  closeButton: {
    position: "absolute",
    right: 16,
    bottom: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  optionCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  labelInput: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 13,
    letterSpacing: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  canvasContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  canvasWrapper: {
    borderRadius: 12,
    borderWidth: 2,
    overflow: "hidden",
  },
  emptyCanvas: {
    width: "100%",
    aspectRatio: CANVAS_ASPECT,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  themeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 8,
  },
  themeItem: {
    alignItems: "center",
    gap: 4,
  },
  themeCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  themeLabel: {
    fontFamily: Fonts.medium,
    fontSize: 9,
    letterSpacing: 1,
    textAlign: "center",
  },
  intensityRow: {
    paddingHorizontal: 32,
  },
  slider: {
    width: "100%",
    height: 32,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontFamily: Fonts.semibold,
    fontSize: 15,
  },
});
