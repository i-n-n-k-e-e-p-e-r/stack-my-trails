import {
  Skia,
  BlendMode,
  PaintStyle,
  StrokeCap,
  StrokeJoin,
  BlurStyle,
  TileMode,
} from '@shopify/react-native-skia';
import type { SkCanvas, SkPath, SkTypeface } from '@shopify/react-native-skia';
import type { Region } from 'react-native-maps';
import { computeBoundingBox, type Trail } from '@/lib/geo';

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
  mapStyle: 'light' | 'dark';
  trailColor: string;
  trailOpacity: number;
  blendMode: BlendMode;
  glow: boolean;
  glowSigma: number;
  labelColor: string;
}

export const POSTER_THEMES: PosterTheme[] = [
  {
    id: 'noir',
    name: 'NOIR',
    tintColor: '#121212',
    tintOpacity: 0.88,
    mapStyle: 'dark',
    trailColor: '#FCC803',
    trailOpacity: 0.25,
    blendMode: BlendMode.Screen,
    glow: true,
    glowSigma: 4,
    labelColor: '#FCC803',
  },
  {
    id: 'architect',
    name: 'ARCHITECT',
    tintColor: '#1B2B48',
    tintOpacity: 0.85,
    mapStyle: 'dark',
    trailColor: '#60A5FA',
    trailOpacity: 0.25,
    blendMode: BlendMode.Screen,
    glow: false,
    glowSigma: 0,
    labelColor: '#FFFFFF',
  },
  {
    id: 'minimalist',
    name: 'MINIMALIST',
    tintColor: '#FAFAFA',
    tintOpacity: 0.82,
    mapStyle: 'light',
    trailColor: '#1A1A2E',
    trailOpacity: 0.20,
    blendMode: BlendMode.Multiply,
    glow: false,
    glowSigma: 0,
    labelColor: '#1A1A2E',
  },
  {
    id: 'clean',
    name: 'CLEAN',
    tintColor: '#F5F6F7',
    tintOpacity: 0,
    mapStyle: 'light',
    trailColor: '#212529',
    trailOpacity: 0.25,
    blendMode: BlendMode.SrcOver,
    glow: false,
    glowSigma: 0,
    labelColor: '#212529',
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
 * Uses Web Mercator projection (matching Apple Maps) for Y-axis.
 * When a visibleRegion is provided with no padding, uses separate X/Y scales
 * to fill the canvas exactly (matching the MapView's rendering).
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
  labelText: string;
  typeface: SkTypeface | null;
}

export function drawPoster(
  canvas: SkCanvas,
  width: number,
  height: number,
  paths: SkPath[],
  options: PosterOptions,
) {
  const { theme, strokeWidth, opacity, showLabel, labelText } = options;

  // Background is provided by the MapView + tint overlay in the view hierarchy.
  // The Skia canvas is transparent so the map shows through.

  // 1. Glow pass (Noir only)
  if (theme.glow && theme.glowSigma > 0) {
    const glowPaint = Skia.Paint();
    glowPaint.setStyle(PaintStyle.Stroke);
    glowPaint.setStrokeWidth(strokeWidth * 2.5);
    glowPaint.setStrokeCap(StrokeCap.Round);
    glowPaint.setStrokeJoin(StrokeJoin.Round);
    glowPaint.setAntiAlias(true);
    glowPaint.setColor(Skia.Color(theme.trailColor));
    glowPaint.setAlphaf(opacity * 0.4);
    glowPaint.setBlendMode(theme.blendMode);
    glowPaint.setMaskFilter(
      Skia.MaskFilter.MakeBlur(BlurStyle.Normal, theme.glowSigma, true),
    );

    for (const path of paths) {
      canvas.drawPath(path, glowPaint);
    }
  }

  // 2. Trail paths
  const trailPaint = Skia.Paint();
  trailPaint.setStyle(PaintStyle.Stroke);
  trailPaint.setStrokeWidth(strokeWidth);
  trailPaint.setStrokeCap(StrokeCap.Round);
  trailPaint.setStrokeJoin(StrokeJoin.Round);
  trailPaint.setAntiAlias(true);
  trailPaint.setColor(Skia.Color(theme.trailColor));
  trailPaint.setAlphaf(opacity);
  trailPaint.setBlendMode(theme.blendMode);

  for (const path of paths) {
    canvas.drawPath(path, trailPaint);
  }

  // 3. Label background gradient (fades from transparent to tintColor)
  if (showLabel && labelText) {
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
        Skia.Color(`rgba(${r}, ${g}, ${b}, 0.85)`),
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

  // 4. Label stamp (requires a loaded typeface)
  if (showLabel && labelText && options.typeface) {
    const labelPaint = Skia.Paint();
    labelPaint.setColor(Skia.Color(theme.labelColor));
    labelPaint.setAntiAlias(true);
    labelPaint.setBlendMode(BlendMode.SrcOver);

    const fontSize = Math.round(width * 0.04);
    const font = Skia.Font(options.typeface, fontSize);

    const textWidth = font.measureText(labelText).width;
    const x = (width - textWidth) / 2;
    const y = height - Math.round(height * 0.05);

    canvas.drawText(labelText, x, y, labelPaint, font);
  }
}
