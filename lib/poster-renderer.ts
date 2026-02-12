import {
  Skia,
  BlendMode,
  PaintStyle,
  StrokeCap,
  StrokeJoin,
  BlurStyle,
  TileMode,
  ImageFormat,
  TextAlign,
} from "@shopify/react-native-skia";
import type {
  SkCanvas,
  SkPath,
  SkImage,
  SkTypeface,
} from "@shopify/react-native-skia";
import type { Region } from "react-native-maps";
import { computeBoundingBox, type Trail } from "@/lib/geo";

// ---------------------------------------------------------------------------
// Poster themes
// ---------------------------------------------------------------------------

export interface PosterTheme {
  id: string;
  name: string;
  /** Tint overlay color rendered over the map background */
  tintColor: string;
  /** Tint overlay opacity (0–1). Higher = less map visible */
  tintOpacity: number;
  /** Map styling: dark or light base map */
  mapStyle: "light" | "dark";
  trailColor: string;
  trailOpacity: number;
  blendMode: BlendMode;
  glow: boolean;
  glowSigma: number;
  labelColor: string;
  buttonBackgroundColor: string;
  buttonLabelColor: string;
}

export const POSTER_THEMES: PosterTheme[] = [
  {
    id: "noir",
    name: "NOIR",
    tintColor: "#121212",
    tintOpacity: 0.88,
    mapStyle: "dark",
    trailColor: "#FCC803",
    trailOpacity: 0.25,
    blendMode: BlendMode.Screen,
    glow: true,
    glowSigma: 4,
    labelColor: "#FCC803",
    buttonBackgroundColor: "#121212",
    buttonLabelColor: "#FCC803",
  },
  {
    id: "architect",
    name: "ARCHITECT",
    tintColor: "#1B2B48",
    tintOpacity: 0.85,
    mapStyle: "dark",
    trailColor: "#60A5FA",
    trailOpacity: 0.25,
    blendMode: BlendMode.Screen,
    glow: false,
    glowSigma: 0,
    labelColor: "#FFFFFF",
    buttonBackgroundColor: "#1B2B48",
    buttonLabelColor: "#60A5FA",
  },
  {
    id: "minimalist",
    name: "MINIMALIST",
    tintColor: "#FAFAFA",
    tintOpacity: 0.82,
    mapStyle: "light",
    trailColor: "#1A1A2E",
    trailOpacity: 0.2,
    blendMode: BlendMode.Multiply,
    glow: false,
    glowSigma: 0,
    labelColor: "#1A1A2E",
    buttonBackgroundColor: "#FAFAFA",
    buttonLabelColor: "#1A1A2E",
  },
  {
    id: "clean",
    name: "CLEAN",
    tintColor: "#F5F6F7",
    tintOpacity: 0,
    mapStyle: "light",
    trailColor: "#212529",
    trailOpacity: 0.25,
    blendMode: BlendMode.SrcOver,
    glow: false,
    glowSigma: 0,
    labelColor: "#212529",
    buttonBackgroundColor: "#212529",
    buttonLabelColor: "#F5F6F7",
  },
];

// ---------------------------------------------------------------------------
// Mercator projection helper
// ---------------------------------------------------------------------------

const DEG_TO_RAD = Math.PI / 180;

function latToMercatorY(lat: number): number {
  const latRad = lat * DEG_TO_RAD;
  return Math.log(Math.tan(Math.PI / 4 + latRad / 2));
}

function mercatorYToLat(y: number): number {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / DEG_TO_RAD;
}

/**
 * Crop a map region to a target aspect ratio (width/height) using Mercator
 * projection, so the poster shows a SUBSET of the original framing rather
 * than expanding to show more area.
 */
export function cropRegionToAspect(
  region: Region,
  targetAspect: number,
): Region {
  const minLat = region.latitude - region.latitudeDelta / 2;
  const maxLat = region.latitude + region.latitudeDelta / 2;
  const mercMinY = latToMercatorY(minLat);
  const mercMaxY = latToMercatorY(maxLat);
  const mercYRange = mercMaxY - mercMinY;
  const mercXRange = region.longitudeDelta * DEG_TO_RAD;
  const currentAspect = mercXRange / mercYRange;

  if (currentAspect < targetAspect) {
    // Source is more portrait than target — crop latitude
    const newMercYRange = mercXRange / targetAspect;
    const centerMercY = (mercMaxY + mercMinY) / 2;
    const newMinLat = mercatorYToLat(centerMercY - newMercYRange / 2);
    const newMaxLat = mercatorYToLat(centerMercY + newMercYRange / 2);
    return {
      latitude: (newMinLat + newMaxLat) / 2,
      longitude: region.longitude,
      latitudeDelta: newMaxLat - newMinLat,
      longitudeDelta: region.longitudeDelta,
    };
  } else {
    // Source is wider than target — crop longitude
    const newMercXRange = mercYRange * targetAspect;
    return {
      latitude: region.latitude,
      longitude: region.longitude,
      latitudeDelta: region.latitudeDelta,
      longitudeDelta: newMercXRange / DEG_TO_RAD,
    };
  }
}

// ---------------------------------------------------------------------------
// Coordinate → canvas transformation
// ---------------------------------------------------------------------------

interface Transform {
  toCanvas: (lat: number, lng: number) => { x: number; y: number };
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Build a coordinate transformer from GPS space to canvas pixel space.
 * Uses Web Mercator projection (matching Maps) for Y-axis.
 */
export function buildTransform(
  trails: Trail[],
  canvasWidth: number,
  canvasHeight: number,
  visibleRegion: Region | null,
  paddingRatio = 0.06,
): Transform {
  let minLat: number, maxLat: number, minLng: number, maxLng: number;

  if (visibleRegion) {
    const halfLat = visibleRegion.latitudeDelta / 2;
    const halfLng = visibleRegion.longitudeDelta / 2;
    minLat = visibleRegion.latitude - halfLat;
    maxLat = visibleRegion.latitude + halfLat;
    minLng = visibleRegion.longitude - halfLng;
    maxLng = visibleRegion.longitude + halfLng;
  } else {
    const allCoords = trails.flatMap((t) => t.coordinates);
    if (allCoords.length === 0) {
      return {
        toCanvas: () => ({ x: canvasWidth / 2, y: canvasHeight / 2 }),
        canvasWidth,
        canvasHeight,
      };
    }
    const bbox = computeBoundingBox(allCoords);
    minLat = bbox.minLat;
    maxLat = bbox.maxLat;
    minLng = bbox.minLng;
    maxLng = bbox.maxLng;
  }

  // Convert latitude bounds to Mercator Y
  const mercMinY = latToMercatorY(minLat);
  const mercMaxY = latToMercatorY(maxLat);

  const padX = canvasWidth * paddingRatio;
  const padY = canvasHeight * paddingRatio;
  const drawW = canvasWidth - padX * 2;
  const drawH = canvasHeight - padY * 2;

  // Both extents in Mercator units so aspect ratio comparison is correct
  const mercMinX = minLng * DEG_TO_RAD;
  const geoW = (maxLng - minLng) * DEG_TO_RAD || 0.001;
  const geoH = mercMaxY - mercMinY || 0.001;

  // Always use a single Mercator scale — Mercator projection uses the same
  // scale for both axes. Using separate scales distorts proportions.
  const scale = Math.min(drawW / geoW, drawH / geoH);
  const usedW = geoW * scale;
  const usedH = geoH * scale;
  const offsetX = padX + (drawW - usedW) / 2;
  const offsetY = padY + (drawH - usedH) / 2;

  return {
    toCanvas: (lat: number, lng: number) => ({
      x: offsetX + (lng * DEG_TO_RAD - mercMinX) * scale,
      y: offsetY + (mercMaxY - latToMercatorY(lat)) * scale,
    }),
    canvasWidth,
    canvasHeight,
  };
}

// ---------------------------------------------------------------------------
// Build Skia paths from trails
// ---------------------------------------------------------------------------

export function buildTrailPaths(
  trails: Trail[],
  transform: Transform,
): SkPath[] {
  const paths: SkPath[] = [];

  for (const trail of trails) {
    if (trail.coordinates.length < 2) continue;

    const path = Skia.Path.Make();
    const first = transform.toCanvas(
      trail.coordinates[0].latitude,
      trail.coordinates[0].longitude,
    );
    path.moveTo(first.x, first.y);

    for (let i = 1; i < trail.coordinates.length; i++) {
      const pt = transform.toCanvas(
        trail.coordinates[i].latitude,
        trail.coordinates[i].longitude,
      );
      path.lineTo(pt.x, pt.y);
    }

    paths.push(path);
  }

  return paths;
}

// ---------------------------------------------------------------------------
// Draw poster onto a Skia canvas
// ---------------------------------------------------------------------------

export interface PosterOptions {
  theme: PosterTheme;
  strokeWidth: number;
  opacity: number;
  showLabel: boolean;
  showBorder: boolean;
  labelText: string;
  heading?: number;
}

export function drawPoster(
  canvas: SkCanvas,
  width: number,
  height: number,
  paths: SkPath[],
  options: PosterOptions,
) {
  const {
    theme,
    strokeWidth,
    opacity,
    showLabel,
    labelText,
    heading = 0,
  } = options;
  const hasLabel = showLabel && !!labelText;

  // Smooth sharp GPS corners with circular arcs
  const cornerEffect = Skia.PathEffect.MakeCorner(strokeWidth * 1.5);

  // Rotate canvas for trail drawing to match MapView heading
  if (heading !== 0) {
    canvas.save();
    canvas.rotate(-heading, width / 2, height / 2);
  }

  // 1. Glow pass (Noir only)
  if (theme.glow && theme.glowSigma > 0) {
    const glowPaint = Skia.Paint();
    glowPaint.setStyle(PaintStyle.Stroke);
    glowPaint.setStrokeWidth(strokeWidth * 2);
    glowPaint.setStrokeCap(StrokeCap.Round);
    glowPaint.setStrokeJoin(StrokeJoin.Round);
    glowPaint.setAntiAlias(true);
    glowPaint.setColor(Skia.Color(theme.trailColor));
    glowPaint.setAlphaf(opacity * 0.3);
    glowPaint.setBlendMode(theme.blendMode);
    glowPaint.setMaskFilter(
      Skia.MaskFilter.MakeBlur(BlurStyle.Normal, theme.glowSigma, true),
    );
    if (cornerEffect) glowPaint.setPathEffect(cornerEffect);

    for (const path of paths) {
      canvas.drawPath(path, glowPaint);
    }
  }

  // 2. Trail paths (outer — provides width and soft edges)
  const trailPaint = Skia.Paint();
  trailPaint.setStyle(PaintStyle.Stroke);
  trailPaint.setStrokeWidth(strokeWidth);
  trailPaint.setStrokeCap(StrokeCap.Round);
  trailPaint.setStrokeJoin(StrokeJoin.Round);
  trailPaint.setAntiAlias(true);
  trailPaint.setColor(Skia.Color(theme.trailColor));
  trailPaint.setAlphaf(opacity);
  trailPaint.setBlendMode(theme.blendMode);
  if (cornerEffect) trailPaint.setPathEffect(cornerEffect);

  for (const path of paths) {
    canvas.drawPath(path, trailPaint);
  }

  // 2b. Sharp core pass — thinner, brighter line on top for crisp center
  const corePaint = Skia.Paint();
  corePaint.setStyle(PaintStyle.Stroke);
  corePaint.setStrokeWidth(Math.max(0.5, strokeWidth * 0.35));
  corePaint.setStrokeCap(StrokeCap.Round);
  corePaint.setStrokeJoin(StrokeJoin.Round);
  corePaint.setAntiAlias(true);
  corePaint.setColor(Skia.Color(theme.trailColor));
  corePaint.setAlphaf(Math.min(1, opacity * 1.6));
  corePaint.setBlendMode(theme.blendMode);
  if (cornerEffect) corePaint.setPathEffect(cornerEffect);

  for (const path of paths) {
    canvas.drawPath(path, corePaint);
  }

  // Restore canvas rotation so border/label draw north-up
  if (heading !== 0) {
    canvas.restore();
  }

  // 3. Decorative border with solid margin fill (drawn before label so label sits on top)
  if (options.showBorder) {
    const sideInset = Math.round(width * 0.035);
    // When label is shown, enlarge bottom margin — label sits below the frame
    const bottomInset = hasLabel ? Math.round(height * 0.12) : sideInset;

    // Fill margin area with solid tint color (covers trails at edges)
    const marginPaint = Skia.Paint();
    marginPaint.setColor(Skia.Color(theme.tintColor));
    marginPaint.setAntiAlias(true);
    marginPaint.setBlendMode(BlendMode.SrcOver);

    // Top
    canvas.drawRect({ x: 0, y: 0, width, height: sideInset }, marginPaint);
    // Bottom (larger when label shown)
    canvas.drawRect(
      { x: 0, y: height - bottomInset, width, height: bottomInset },
      marginPaint,
    );
    // Left
    canvas.drawRect(
      {
        x: 0,
        y: sideInset,
        width: sideInset,
        height: height - sideInset - bottomInset,
      },
      marginPaint,
    );
    // Right
    canvas.drawRect(
      {
        x: width - sideInset,
        y: sideInset,
        width: sideInset,
        height: height - sideInset - bottomInset,
      },
      marginPaint,
    );

    // Border line — bottom edge stops before the label area
    const borderPaint = Skia.Paint();
    borderPaint.setStyle(PaintStyle.Stroke);
    borderPaint.setStrokeWidth(Math.max(1, Math.round(width * 0.003)));
    borderPaint.setColor(Skia.Color(theme.labelColor));
    borderPaint.setAlphaf(0.5);
    borderPaint.setAntiAlias(true);
    borderPaint.setBlendMode(BlendMode.SrcOver);

    canvas.drawRect(
      {
        x: sideInset,
        y: sideInset,
        width: width - sideInset * 2,
        height: height - sideInset - bottomInset,
      },
      borderPaint,
    );
  }

  // 4. Label background gradient (only when no border — border margin already provides solid bg)
  if (hasLabel && !options.showBorder) {
    const gradientH = Math.round(height * 0.25);
    const gradientTop = height - gradientH;

    const r = parseInt(theme.tintColor.slice(1, 3), 16);
    const g = parseInt(theme.tintColor.slice(3, 5), 16);
    const b = parseInt(theme.tintColor.slice(5, 7), 16);

    const gradientPaint = Skia.Paint();
    gradientPaint.setAntiAlias(true);
    gradientPaint.setBlendMode(BlendMode.SrcOver);

    const shader = Skia.Shader.MakeLinearGradient(
      { x: 0, y: gradientTop },
      { x: 0, y: height },
      [
        Skia.Color(`rgba(${r}, ${g}, ${b}, 0)`),
        Skia.Color(`rgba(${r}, ${g}, ${b}, 0.97)`),
      ],
      [0, 1],
      TileMode.Clamp,
    );
    if (shader) {
      gradientPaint.setShader(shader);
      canvas.drawRect(
        { x: 0, y: gradientTop, width, height: gradientH },
        gradientPaint,
      );
    }
  }

  // 5. Label text is rendered as a React Native <Text> overlay (supports emoji)
}

// ---------------------------------------------------------------------------
// High-resolution offscreen export
// ---------------------------------------------------------------------------

export const EXPORT_WIDTH = 3000;
export const EXPORT_HEIGHT = 4000;

/**
 * Draw poster label text using Skia Paragraph API.
 * Renders at full export resolution (no bitmap upscaling).
 */
function drawPosterLabel(
  canvas: SkCanvas,
  width: number,
  height: number,
  labelText: string,
  labelColor: string,
  showBorder: boolean,
  typeface: SkTypeface,
) {
  const fontSize = Math.round(width * 0.04);
  const areaH = Math.round(height * (showBorder ? 0.12 : 0.1));

  const provider = Skia.TypefaceFontProvider.Make();
  provider.registerFont(typeface, "PosterFont");

  const builder = Skia.ParagraphBuilder.Make(
    {
      textAlign: TextAlign.Center,
      textStyle: {
        color: Skia.Color(labelColor),
        fontSize,
        fontFamilies: ["PosterFont"],
        letterSpacing: fontSize * 0.06,
      },
    },
    provider,
  );
  builder.addText(labelText);
  const paragraph = builder.build();
  paragraph.layout(width);

  const textH = paragraph.getHeight();
  const y = height - areaH + (areaH - textH) / 2;
  paragraph.paint(canvas, 0, y);
}

/**
 * Render poster to a high-resolution offscreen Skia surface.
 * Returns base64-encoded PNG string, or null on failure.
 *
 * When showMap is true and mapImage is provided, the captured map screenshot
 * is drawn as the background (scaled to fill). Otherwise a solid tint color
 * background is used.
 */
export function renderHighResPoster(
  trails: Trail[],
  visibleRegion: Region | null,
  options: PosterOptions,
  previewWidth: number,
  showMap: boolean,
  mapImage: SkImage | null,
  labelTypeface: SkTypeface | null,
): string | null {
  const w = EXPORT_WIDTH;
  const h = EXPORT_HEIGHT;
  const scale = w / previewWidth;

  const surface = Skia.Surface.Make(w, h);
  if (!surface) return null;

  const canvas = surface.getCanvas();

  // 1. Background
  if (showMap && mapImage) {
    const paint = Skia.Paint();
    canvas.drawImageRect(
      mapImage,
      { x: 0, y: 0, width: mapImage.width(), height: mapImage.height() },
      { x: 0, y: 0, width: w, height: h },
      paint,
    );
    // Tint overlay
    if (options.theme.tintOpacity > 0) {
      const tintPaint = Skia.Paint();
      tintPaint.setColor(Skia.Color(options.theme.tintColor));
      tintPaint.setAlphaf(options.theme.tintOpacity);
      canvas.drawRect({ x: 0, y: 0, width: w, height: h }, tintPaint);
    }
  } else {
    const bgPaint = Skia.Paint();
    bgPaint.setColor(Skia.Color(options.theme.tintColor));
    canvas.drawRect({ x: 0, y: 0, width: w, height: h }, bgPaint);
  }

  // 2. Build paths at export resolution
  const padding = showMap ? 0 : 0.04;
  const transform = buildTransform(trails, w, h, visibleRegion, padding);
  const paths = buildTrailPaths(trails, transform);

  // 3. Draw trails, border, gradient — scale stroke and glow proportionally
  const scaledTheme: PosterTheme = {
    ...options.theme,
    glowSigma: options.theme.glowSigma * scale,
  };
  drawPoster(canvas, w, h, paths, {
    ...options,
    theme: scaledTheme,
    strokeWidth: options.strokeWidth * scale,
  });

  // 4. Draw label text via Skia Paragraph (sharp at full resolution)
  if (options.showLabel && options.labelText && labelTypeface) {
    drawPosterLabel(
      canvas,
      w,
      h,
      options.labelText,
      options.theme.labelColor,
      options.showBorder,
      labelTypeface,
    );
  }

  // 5. Encode to PNG
  surface.flush();
  const image = surface.makeImageSnapshot();
  return image.encodeToBase64(ImageFormat.PNG, 100);
}
