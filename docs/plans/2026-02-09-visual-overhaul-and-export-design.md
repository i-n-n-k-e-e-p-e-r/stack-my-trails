# Visual Overhaul & Export Flow — Design Document

**Date:** 2026-02-09
**Status:** Approved
**Scope:** Phase 1 (Visual Overhaul) + Phase 2 (Export/Poster Flow)

---

## Overview

Two-phase redesign of Stack My Trails. Phase 1 transforms the visual identity (palette, typography, component styling) while keeping the same navigation structure and functionality. Phase 2 adds a Skia-powered poster export flow.

### Key Decisions

- **Styling system:** Keep `StyleSheet.create()` — no NativeWind migration
- **Trail coloring:** Opacity stacking (teal at low alpha, overlaps compound naturally)
- **Navigation:** Keep 3 tabs (Trails, Stack, Settings) + modals
- **Typography:** Bundle Geist font via `expo-font`
- **Tab icons:** Custom PNG assets (gradient active, gray inactive)
- **Glassmorphism:** Subtle — tab bar and Stack screen floating card only
- **Export rendering:** `react-native-skia` with additive blending for poster-quality output
- **Live map:** Standard `react-native-maps` Polylines with opacity stacking

---

## Phase 1: Visual Overhaul

### 1.1 Color Palette

Updated `constants/theme.ts`:

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `background` | `#F8FAFB` | `#121212` | Screen backgrounds |
| `surface` | `#FFFFFF` | `#1E1E1E` | Cards, list items |
| `surfaceGlass` | `rgba(255,255,255,0.85)` | `rgba(30,30,30,0.80)` | Translucent overlays |
| `text` | `#1A1A2E` | `#F0F0F0` | Primary text |
| `textSecondary` | `#6B7280` | `#9CA3AF` | Muted text |
| `teal` | `#2DD4BF` | `#2DD4BF` | Brand accent, active states |
| `orange` | `#FB923C` | `#FB923C` | Secondary accent, warm |
| `sky` | `#60A5FA` | `#60A5FA` | Tertiary accent |
| `trailStroke` | `rgba(45,212,191,0.8)` | `rgba(45,212,191,0.8)` | Single trail preview |
| `trailStacked` | `rgba(45,212,191,0.25)` | `rgba(45,212,191,0.30)` | Stacked trails (low opacity for intensity) |
| `border` | `#E5E7EB` | `#2A2D2E` | Dividers, card borders |
| `danger` | `#EF4444` | `#EF4444` | Destructive actions |

### 1.2 Typography

Bundle **Geist** font family via `expo-font`.

**Weight tokens:**
- `regular` (400) — body text, secondary labels
- `medium` (500) — card titles, row labels
- `semibold` (600) — section headers, buttons
- `bold` (700) — screen titles

**Special treatment:**
- Uppercase with letter-spacing 1.5 for small labels (e.g., "DATE RANGE", "AREAS", "STACKED LAYERS")
- Screen titles: Geist bold, 28pt

**Font files needed:**
- `Geist-Regular.otf`
- `Geist-Medium.otf`
- `Geist-SemiBold.otf`
- `Geist-Bold.otf`

Place in `assets/fonts/`. Load in root `_layout.tsx` with `useFonts()`, gate render on load.

### 1.3 Tab Icons — Asset Spec

**6 PNG files required** (active + inactive for each tab):

| Tab | Active file | Inactive file |
|-----|------------|---------------|
| Trails | `trails-active.png` | `trails-inactive.png` |
| Stack | `stack-active.png` | `stack-inactive.png` |
| Settings | `settings-active.png` | `settings-inactive.png` |

**Export spec:**
- **Canvas size:** 56×56px @1x
- **Export resolutions:** @2x (112×112px) and @3x (168×168px)
- **Active variant:** Teal→orange gradient icons (from existing designs in `styles-refactoring/icons/`)
- **Inactive variant:** Same silhouette in solid `#9CA3AF` (gray)
- **Format:** PNG with alpha transparency
- **File naming:** `trails-active@2x.png`, `trails-active@3x.png`, etc.
- **Location:** `assets/icons/`

### 1.4 Tab Bar

- Background: `surfaceGlass` + `BlurView` (backdrop blur)
- No top border — subtle shadow instead (`shadowOpacity: 0.05`)
- Icon size: 28pt
- Labels hidden (`showLabel: false`)
- Active: full-color gradient PNG
- Inactive: gray PNG at 100% opacity (the gray variant itself provides the muted look)
- Tab bar height: ~60pt + bottom safe area

### 1.5 Trails Screen (Tab 1)

**Layout:** Split-screen — map preview (top 50%) + scrollable list (bottom 50%). Same as current.

**Map preview:**
- Edge-to-edge at top (no border radius)
- Trail color: `trailStroke` (teal)
- Map: `mutedStandard` + `userInterfaceStyle`

**Screen header:**
- "Your Trails" — Geist bold, 28pt, custom rendered (not system nav bar)
- Top padding: safe area inset

**Trail cards:**
- `surface` background, `borderRadius: 20`
- Border: 1px `border` color
- Shadow: `shadowOpacity: 0.04`, `shadowRadius: 8`
- Padding: 16px, gap between cards: 12px
- **Top row:** Activity emoji + title/date (Geist medium), secondary in `textSecondary`
- **Bottom row:** Metadata pills — primary pill: `teal` at 10% opacity bg with `teal` text, secondary pills: `border` bg
- **Selected state:** 3px left accent bar in `teal` (replaces background color change)

**Empty state:**
- Centered trail icon (from icon set) at 20% opacity, large watermark
- "No trails yet" — Geist semibold
- "Import Workouts" button — solid `teal`, white text, `borderRadius: 16`

### 1.6 Stack Screen (Tab 2)

**Full-screen map** — edge-to-edge, all UI floats on top.

**Trail rendering:**
- All Polylines: `trailStacked` color (teal at 0.25–0.30 opacity)
- `strokeWidth: 2.5`
- `lineCap: "round"`, `lineJoin: "round"`
- Overlapping trails compound opacity naturally — this IS the heatmap effect

**Floating top card:**
- Position: top, safe area inset + 8px
- `surfaceGlass` background + `BlurView`
- `borderRadius: 24`, padding: 20h × 14v
- Left: area label (Geist semibold, 15pt) + trail count (Geist regular, `textSecondary`, 13pt)
- Right: filter icon button (teal tint) → opens filter modal
- (Phase 2 adds export button here)

**Empty state:** Same pattern as Trails tab.

**Loading overlay:** Semi-transparent `background` + spinner + "Loading trails..." (Geist medium).

### 1.7 Settings Screen (Tab 3)

**Scrollable screen with sectioned cards.**

**Header:** "Settings" — Geist bold, 28pt, safe area top padding.

**Section 1: "Health Data"**
- Card: `surface` bg, `borderRadius: 20`, subtle shadow
- Rows: "Total trails" (count right-aligned, Geist semibold), "Last import" (relative date, `textSecondary`)
- Row dividers: 1px `border`, inset 16px
- Buttons below card:
  - "Import Workouts" — solid `teal` bg, white text, `borderRadius: 16`, full width
  - "Fetch New Routes" — outlined: `teal` border, `teal` text, transparent bg
- Progress bar: 4px height, `borderRadius: 2`, teal fill on `border` track
- Progress text: "12 / 47 workouts" below bar

**Section 2: "Appearance"**
- Three-option segmented control: Auto / Light / Dark
- Active segment: `teal` bg, white text
- Inactive: `surface` bg, `textSecondary` text
- Outer `borderRadius: 12`, inner `borderRadius: 10`

**Section 3: "Data"**
- "Delete All Data" — `danger` color text, no card background, subtle top border
- Feels separate and appropriately dangerous

**Footer:** App version + supported activities, `textSecondary`, centered.

### 1.8 Filter Modal

**Modal sheet from bottom.**

**Header:**
- Drag handle: 40px wide, 4px tall, `border` color, `borderRadius: 2`, centered
- "Filters" — Geist semibold, 20pt, centered

**Date range (fixed top):**
- Section label: "DATE RANGE" — uppercase, Geist medium, 11pt, `textSecondary`, tracking 1.5
- Preset pills (horizontal scroll): `1D`, `1W`, `1M`, `6M`, `1Y`, `All`
  - Active: `teal` bg, white text
  - Inactive: `surface` bg + `border`, `textSecondary` text
  - `borderRadius: 12`, padding: 8h × 6v
- Native date pickers: tint updated to `teal`

**Area list (scrollable):**
- Section label: "AREAS" — same uppercase tracking
- Group rows: location (Geist medium) + count pill (teal 10% bg, teal text) + chevron
- Chevron: rotates 90° on expand
- Sub-area rows: indented 24px, Geist regular, 14pt
- Radio indicator: filled circle in `teal`
- Dividers: 1px `border`, inset

**Apply button (sticky bottom):**
- Solid `teal` bg, white text, Geist semibold
- `borderRadius: 16`, full width, 20px horizontal margin
- Bottom safe area padding
- Disabled: 40% opacity

---

## Phase 2: Export / Poster Flow

### 2.1 Entry Point

Export button added to Stack screen's floating top card — icon button next to the filter button. Opens `app/export-modal.tsx` as a full-screen modal.

### 2.2 Export Studio Screen

**Layout:**
- Top ~75%: Skia canvas with trail rendering
- Bottom ~25%: Control panel (glassmorphism card, scrollable)

**Skia canvas:**
- No map tiles — trails on solid color background (per selected theme)
- Trails drawn as Skia `Path` objects
- Blend mode: `BlendMode.Screen` (additive) — overlaps intensify naturally
- Color gradient: cold areas = base color, hot overlaps shift toward warm
- Optional glow layer: duplicate paths with `MaskFilter.MakeBlur()` underneath
- Pinch-to-zoom and pan for composition framing
- What you see = what you export

### 2.3 Three Poster Themes

| Theme | Background | Trail base | Hot color | Vibe |
|-------|-----------|------------|-----------|------|
| **Noir** | `#121212` deep slate | `#2DD4BF` teal | `#FB923C` orange | Neon on dark |
| **Architect** | `#1B2B48` navy | `#60A5FA` sky blue | `#FFFFFF` white | Blueprint |
| **Minimalist** | `#FAFAFA` off-white | `#1A1A2E` dark ink | `#2DD4BF` teal | Clean print |

Theme picker: horizontal scroll of 3 thumbnails (60×80pt, `borderRadius: 12`). Active: 2px `teal` border. Name below: uppercase, 10pt, tracked.

### 2.4 Controls

**Intensity slider:**
- Controls `strokeWidth` (1.0 → 4.0) and base opacity (0.15 → 0.50)
- Real-time Skia canvas update
- Default: 40% position

**Label stamp toggle:**
- Switch: "City Label" with `teal` track
- When on: bottom of canvas shows "CITY NAME — YEAR" (e.g., "LONDON — 2026")
- City from current area filter label, year from date range
- Geist bold, uppercase, tracked, centered
- Optional "EST." prefix in smaller text above

### 2.5 Export Actions

Two buttons side by side at bottom:
- **"Save PNG"** — solid `teal`, saves high-res (3x canvas) to camera roll
- **"Share"** — outlined `teal`, opens iOS share sheet

Uses `react-native-view-shot` for capture. Brief spinner overlay during render.

---

## New Dependencies

| Package | Phase | Purpose |
|---------|-------|---------|
| `expo-font` | 1 | Load Geist font (already in Expo SDK) |
| `@shopify/react-native-skia` | 2 | Poster canvas rendering |
| `react-native-view-shot` | 2 | High-res export capture |
| `expo-media-library` | 2 | Save to camera roll |

### Prebuild Required

After adding Skia (Phase 2): `npx expo prebuild --platform ios --clean && npx expo run:ios --device`

---

## Not in Scope (YAGNI)

- Per-activity-type color coding (all trails same color, intensity differentiates)
- Privacy masks / safe zones
- Path intensification on live map (Skia-level effects only in export)
- SVG/PDF vector export (PNG sufficient for v1)
- NativeWind migration
- Android (future, but Geist font choice keeps us ready)

---

## Implementation Order (Phase 1)

1. Add Geist font — `expo-font` setup, font files, loading gate
2. Update `constants/theme.ts` — new color palette + font tokens
3. Prepare icon assets — user exports PNGs per spec above
4. Tab bar restyle — custom icons, hidden labels, glassmorphism
5. Trails screen — cards, selected state, empty state, header
6. Stack screen — teal opacity stacking, floating glassmorphism card
7. Settings screen — sectioned cards, segmented control, buttons
8. Filter modal — colors, pills, tracking typography
9. Prebuild & device test

## Implementation Order (Phase 2)

1. Install `@shopify/react-native-skia` + `react-native-view-shot` + `expo-media-library`, prebuild
2. New `app/export-modal.tsx` screen
3. Skia canvas trail renderer — paths, additive blending, 3 themes
4. Control panel — theme picker, intensity slider, label stamp
5. Export pipeline — high-res capture, camera roll save, share sheet
6. Export button on Stack screen floating card

---

## Risks

- **Skia + New Architecture (Fabric):** Recent `react-native-skia` versions support Fabric, but needs early testing
- **Skia performance with 500+ paths:** May need aggressive pre-simplification for export canvas
- **Geist font loading:** Must gate app render on font load (standard `expo-font` pattern with `SplashScreen.preventAutoHideAsync()`)
