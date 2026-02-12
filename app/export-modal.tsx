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
  Skia,
  createPicture,
} from "@shopify/react-native-skia";
import type { SkPath, SkTypeface } from "@shopify/react-native-skia";
import Slider from "@react-native-community/slider";
import * as MediaLibrary from "expo-media-library";
import { File as ExpoFile, Paths } from "expo-file-system";
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
  renderHighResPoster,
  type PosterTheme,
} from "@/lib/poster-renderer";
import {
  getExportSettings,
  setExportSettings,
  defaultExportSettings,
  THEME_DEFAULT_INTENSITY,
} from "@/lib/export-settings-store";

const INTENSITY_MIN_STROKE = 1.0;
const INTENSITY_MAX_STROKE = 4.0;
const INTENSITY_MIN_OPACITY = 0.15;
const INTENSITY_MAX_OPACITY = 0.5;

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

  const { trails, areaLabel, visibleRegion, heading } = useMemo(
    () => getExportData(),
    [],
  );

  // Theme-appropriate defaults: noir for dark, minimalist for light
  const schemeDefaultThemeId =
    colorScheme === "dark" ? "noir" : "minimalist";

  // Restore persisted settings or use scheme-appropriate defaults
  const saved = useMemo(() => getExportSettings(), []);
  const defaults = useMemo(
    () => defaultExportSettings(schemeDefaultThemeId),
    [schemeDefaultThemeId],
  );
  const initial = saved ?? defaults;

  const [selectedTheme, setSelectedTheme] = useState<PosterTheme>(
    () =>
      POSTER_THEMES.find((t) => t.id === initial.themeId) ??
      POSTER_THEMES.find((t) => t.id === schemeDefaultThemeId)!,
  );
  const [intensity, setIntensity] = useState(initial.intensity);
  const [showLabel, setShowLabel] = useState(initial.showLabel);
  const [showMap, setShowMap] = useState(initial.showMap);
  const [showBorder, setShowBorder] = useState(initial.showBorder);
  const [colorHue, setColorHue] = useState(initial.colorHue);
  const [labelText, setLabelText] = useState(() => {
    if (initial.labelText) return initial.labelText;
    const city = areaLabel || "MY CITY";
    const year = new Date().getFullYear();
    return `${city.toUpperCase()} \u2014 ${year}`;
  });
  const [exporting, setExporting] = useState(false);
  const [labelTypeface, setLabelTypeface] = useState<SkTypeface | null>(null);

  // Persist settings on every change
  useEffect(() => {
    setExportSettings({
      themeId: selectedTheme.id,
      intensity,
      showLabel,
      showMap,
      showBorder,
      colorHue,
      labelText,
    });
  }, [
    selectedTheme.id,
    intensity,
    showLabel,
    showMap,
    showBorder,
    colorHue,
    labelText,
  ]);

  // Load Geist-Bold typeface for high-res label rendering
  useEffect(() => {
    (async () => {
      try {
        const { Asset } = await import("expo-asset");
        const fontAsset = Asset.fromModule(
          require("@/assets/fonts/Geist-Bold.otf"),
        );
        await fontAsset.downloadAsync();
        if (!fontAsset.localUri) return;
        const fontData = await Skia.Data.fromURI(fontAsset.localUri);
        const tf = Skia.Typeface.MakeFreeTypeFaceFromData(fontData);
        if (tf) setLabelTypeface(tf);
      } catch {
        // Font loading failed — label will fall back to ViewShot capture
      }
    })();
  }, []);

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

  // Apply heading to poster MapView once the map has settled on the correct region
  const handleMapReady = useCallback(() => {
    if (!posterMapRef.current || heading === 0) return;
    posterMapRef.current.getCamera().then((cam) => {
      posterMapRef.current?.setCamera({ ...cam, heading });
    }).catch(() => {});
  }, [heading]);

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
    const hdg = heading;
    return createPicture(
      (canvas) => {
        drawPoster(canvas, w, h, paths, {
          theme: adjustedTheme,
          strokeWidth,
          opacity,
          showLabel,
          showBorder,
          labelText,
          heading: hdg,
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
    heading,
  ]);

  const captureHighRes = useCallback(async (): Promise<string | null> => {
    if (canvasWidth === 0 || trails.length === 0) return null;

    // Capture map background if shown (at screen resolution — acceptable for muted bg)
    let mapImage = null;
    if (showMap && posterMapRef.current) {
      try {
        const mapBase64 = await captureRef(posterMapRef, {
          format: "png",
          quality: 1,
          result: "base64",
        });
        const mapData = Skia.Data.fromBase64(mapBase64);
        mapImage = Skia.Image.MakeImageFromEncoded(mapData);
      } catch {
        // Map capture failed — continue without map background
      }
    }

    // Render everything at high resolution via offscreen Skia surface
    const base64 = renderHighResPoster(
      trails,
      transformRegion,
      {
        theme: adjustedTheme,
        strokeWidth,
        opacity,
        showLabel,
        showBorder,
        labelText,
        heading,
      },
      canvasWidth,
      showMap,
      mapImage,
      labelTypeface,
    );
    if (!base64) return null;

    // Write base64 PNG to temp file
    const tmpFile = new ExpoFile(Paths.cache, `poster-${Date.now()}.png`);
    tmpFile.write(base64, { encoding: "base64" });
    return tmpFile.uri;
  }, [
    canvasWidth,
    trails,
    showMap,
    transformRegion,
    adjustedTheme,
    strokeWidth,
    opacity,
    showLabel,
    showBorder,
    labelText,
    labelTypeface,
    heading,
  ]);

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
          { paddingTop: insets.top, borderBottomColor: colors.borderLight },
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
        style={[styles.canvasContainer, { borderColor: colors.borderLight }]}
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
                  onMapReady={handleMapReady}
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

            {showLabel && labelText ? (
              <View
                style={[
                  styles.posterLabelArea,
                  {
                    height: Math.round(
                      canvasHeight * (showBorder ? 0.12 : 0.1),
                    ),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.posterLabelText,
                    {
                      color: adjustedTheme.labelColor,
                      fontSize: Math.round(canvasWidth * 0.04),
                    },
                  ]}
                >
                  {labelText}
                </Text>
              </View>
            ) : null}
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
                  backgroundColor: theme.buttonBackgroundColor,
                  borderColor: theme.buttonLabelColor,
                  borderWidth: active ? 3 : 1.5,
                },
              ]}
              onPress={() => {
                setSelectedTheme(theme);
                setIntensity(
                  THEME_DEFAULT_INTENSITY[theme.id] ?? 0.3,
                );
              }}
            >
              {active && (
                <Feather name="star" size={16} color={theme.buttonLabelColor} />
              )}
            </TouchableOpacity>
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
              borderWidth: showLabel ? 3 : 1.5,
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
              borderWidth: showMap ? 3 : 1.5,
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
              borderWidth: showBorder ? 3 : 1.5,
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
      <View style={[styles.sliderSection, { borderColor: colors.border }]}>
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
          <Text style={[styles.sliderLabel, { color: colors.text }]}>TINT</Text>
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
    gap: 8,
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
    borderWidth: 2,
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
    borderWidth: 2,
    borderRadius: 32,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  canvasContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderRadius: 32,
    borderWidth: 2,
    borderStyle: "dashed",
    marginHorizontal: 16,
  },
  posterLabelArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  posterLabelText: {
    fontFamily: Fonts.bold,
    textAlign: "center",
    letterSpacing: 1,
  },
  emptyCanvas: {
    width: "100%",
    aspectRatio: CANVAS_ASPECT,
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
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  separator: {
    width: 1,
    height: 24,
    marginHorizontal: 4,
  },
  sliderSection: {
    paddingHorizontal: 24,
    borderWidth: 2,
    borderRadius: 32,
    paddingVertical: 8,
    marginHorizontal: 16,
    gap: 8,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
  },
  sliderLabel: {
    fontFamily: Fonts.medium,
    fontSize: 10,
    letterSpacing: 0.5,
    width: 64,
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
    paddingHorizontal: 4,
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
    fontSize: 16,
  },
});
