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

// Themes that support the tint/color hue slider
const TINT_ENABLED_THEMES = new Set(["noir", "clean"]);

// ---------------------------------------------------------------------------
// HSL helpers for color hue slider
// ---------------------------------------------------------------------------

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (c: number) =>
    Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ---------------------------------------------------------------------------
// Export Modal
// ---------------------------------------------------------------------------

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
  const [showBorder, setShowBorder] = useState(false);
  const [colorHue, setColorHue] = useState(0);
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

  const tintEnabled = TINT_ENABLED_THEMES.has(selectedTheme.id);

  // Adjusted theme with hue shift applied to trail color
  const adjustedTheme = useMemo((): PosterTheme => {
    if (colorHue === 0 || !tintEnabled) return selectedTheme;
    const { h, s, l } = hexToHSL(selectedTheme.trailColor);
    const newH = (h + colorHue) % 1;
    // Clean has very dark/desaturated trail color — boost for vivid tints
    const useS = selectedTheme.id === "clean" ? 0.65 : s;
    const useL = selectedTheme.id === "clean" ? 0.45 : l;
    const newTrailColor = hslToHex(newH, useS, useL);
    const adjusted = { ...selectedTheme, trailColor: newTrailColor };
    if (selectedTheme.id === "noir") {
      adjusted.labelColor = newTrailColor;
    }
    return adjusted;
  }, [selectedTheme, colorHue, tintEnabled]);

  const shiftedTrailColor = tintEnabled
    ? adjustedTheme.trailColor
    : colors.borderLight;

  // Poster container size
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const canvasWidth = useMemo(() => {
    if (containerSize.width === 0 || containerSize.height === 0) return 0;
    const maxW = containerSize.width - 48;
    const maxH = containerSize.height - 16;
    const hFromWidth = maxW / CANVAS_ASPECT;
    if (hFromWidth <= maxH) return maxW;
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
          theme: adjustedTheme,
          strokeWidth,
          opacity,
          showLabel,
          showBorder,
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
    adjustedTheme,
    strokeWidth,
    opacity,
    showLabel,
    showBorder,
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

      {/* Title input — always visible, disabled when title toggle is off */}
      <View style={styles.labelRow}>
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

      {/* Poster Preview — full width, no border/radius (WYSIWYG export) */}
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
            style={{ width: canvasWidth, height: canvasHeight }}
          >
            {showMap ? (
              <>
                <MapView
                  ref={posterMapRef}
                  style={StyleSheet.absoluteFill}
                  initialRegion={initialMapRegion}
                  mapType="mutedStandard"
                  userInterfaceStyle={adjustedTheme.mapStyle}
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
                {adjustedTheme.tintOpacity > 0 && (
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        backgroundColor: adjustedTheme.tintColor,
                        opacity: adjustedTheme.tintOpacity,
                      },
                    ]}
                  />
                )}
              </>
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: adjustedTheme.tintColor },
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

      {/* Options row — horizontal: theme bullets | separator | toggles */}
      <View style={styles.optionsRow}>
        {POSTER_THEMES.map((theme) => {
          const active = selectedTheme.id === theme.id;
          return (
            <TouchableOpacity
              key={theme.id}
              style={[
                styles.optionCircle,
                {
                  backgroundColor: active ? colors.accent : theme.tintColor,
                  borderColor: active
                    ? colors.activeSelectionBorder
                    : theme.trailColor,
                  borderWidth: active ? 2 : 1.5,
                },
              ]}
              onPress={() => setSelectedTheme(theme)}
            />
          );
        })}

        <View
          style={[styles.separator, { backgroundColor: colors.borderLight }]}
        />

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
            size={16}
            color={showLabel ? colors.buttonText : colors.textSecondary}
          />
        </TouchableOpacity>

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
            size={16}
            color={showMap ? colors.buttonText : colors.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.optionCircle,
            {
              backgroundColor: showBorder ? colors.accent : "transparent",
              borderColor: showBorder
                ? colors.activeSelectionBorder
                : colors.borderLight,
              borderWidth: showBorder ? 2 : 1.5,
            },
          ]}
          onPress={() => setShowBorder(!showBorder)}
        >
          <Feather
            name="square"
            size={16}
            color={showBorder ? colors.buttonText : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Sliders with labels */}
      <View style={styles.sliderSection}>
        <View style={styles.sliderRow}>
          <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>
            INTENSITY
          </Text>
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
        <View style={[styles.sliderRow, !tintEnabled && { opacity: 0.3 }]}>
          <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>
            TINT
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            value={colorHue}
            onValueChange={setColorHue}
            minimumTrackTintColor={shiftedTrailColor}
            maximumTrackTintColor={colors.borderLight}
            thumbTintColor={shiftedTrailColor}
            disabled={!tintEnabled}
          />
        </View>
      </View>

      {/* Bottom buttons */}
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
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: Fonts.semibold,
    fontSize: 18,
  },
  closeButton: {
    position: "absolute",
    right: 16,
    bottom: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  labelRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  labelInput: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    letterSpacing: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  canvasContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 6,
  },
  emptyCanvas: {
    width: "100%",
    aspectRatio: CANVAS_ASPECT,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  optionCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  separator: {
    width: 1,
    height: 24,
    marginHorizontal: 4,
  },
  sliderSection: {
    paddingHorizontal: 12,
    gap: 0,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sliderLabel: {
    fontFamily: Fonts.medium,
    fontSize: 9,
    letterSpacing: 0.5,
    width: 52,
  },
  slider: {
    flex: 1,
    height: 28,
  },
  bottomBar: {
    paddingHorizontal: 12,
    paddingTop: 4,
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
