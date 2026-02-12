/**
 * Module-level store for persisting export modal settings across sessions.
 * Survives navigation but resets on app restart (module reload).
 */

export interface ExportSettings {
  themeId: string;
  intensity: number;
  showLabel: boolean;
  showMap: boolean;
  showBorder: boolean;
  colorHue: number;
  labelText: string | null;
  /** The areaLabel that was active when labelText was last saved. */
  labelAreaLabel: string | null;
}

// Per-theme default intensity values
export const THEME_DEFAULT_INTENSITY: Record<string, number> = {
  noir: 0.35,
  architect: 0.3,
  minimalist: 0.25,
  clean: 0.2,
};

let _settings: ExportSettings | null = null;

export function getExportSettings(): ExportSettings | null {
  return _settings;
}

export function setExportSettings(update: Partial<ExportSettings>) {
  _settings = { ...(_settings ?? defaultExportSettings("minimalist")), ...update };
}

export function clearExportSettings() {
  _settings = null;
}

/** Build default settings based on color scheme. */
export function defaultExportSettings(
  themeId: string,
): ExportSettings {
  return {
    themeId,
    intensity: THEME_DEFAULT_INTENSITY[themeId] ?? 0.3,
    showLabel: true,
    showMap: true,
    showBorder: false,
    colorHue: 0,
    labelText: null,
    labelAreaLabel: null,
  };
}
