import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";
import { Feather } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, Fonts } from "@/constants/theme";
import { useImportTrails } from "@/hooks/use-import-trails";
import {
  getTrailCount,
  getLastImportDate,
  getLatestTrailDate,
  deleteAllTrails,
  getSetting,
  setSetting,
} from "@/lib/db";
import { useThemePreference, type ThemePreference } from "@/contexts/theme";
import { useTranslation } from "@/contexts/language";
import { LANGUAGES } from "@/lib/i18n";
import { resetFilters } from "@/lib/filter-store";
import { exportTrailData, importTrailData } from "@/lib/trail-data-io";
import Constants from "expo-constants";

const THEME_OPTIONS: { value: ThemePreference; labelKey: string }[] = [
  { value: "auto", labelKey: "settings.theme.auto" },
  { value: "light", labelKey: "settings.theme.light" },
  { value: "dark", labelKey: "settings.theme.dark" },
];

function formatRelativeDate(
  iso: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return t("relativeDate.justNow");
  if (diffMin < 60) return t("relativeDate.minutesAgo", { count: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t("relativeDate.hoursAgo", { count: diffHr });
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return t("relativeDate.daysAgo", { count: diffDay });
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const db = useSQLiteContext();
  const { preference, setPreference } = useThemePreference();
  const { t, language, setLanguage } = useTranslation();

  const { importing, progress, total, error, startImport } = useImportTrails();
  const [trailCount, setTrailCount] = useState(0);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dataExporting, setDataExporting] = useState(false);
  const [dataImporting, setDataImporting] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [gpsFilter, setGpsFilter] = useState(true);
  const [langOpen, setLangOpen] = useState(false);

  const refreshStats = useCallback(() => {
    getTrailCount(db).then(setTrailCount);
    getLastImportDate(db).then(setLastImport);
  }, [db]);

  useEffect(() => {
    refreshStats();
    getSetting(db, "showLocation")
      .then((v) => setShowLocation(v === "true"))
      .catch(() => {});
    getSetting(db, "gpsFilter")
      .then((v) => setGpsFilter(v !== "false"))
      .catch(() => {});
  }, [refreshStats, importing, deleting, db]);

  // Reset filters after import completes or data is deleted
  const prevImporting = React.useRef(importing);
  useEffect(() => {
    if (prevImporting.current && !importing) {
      resetFilters();
    }
    prevImporting.current = importing;
  }, [importing]);

  const handleFetchNew = useCallback(async () => {
    const latest = await getLatestTrailDate(db);
    startImport(latest);
  }, [db, startImport]);

  const handleToggleLocation = useCallback(
    async (value: boolean) => {
      if (value) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            t("settings.alert.locationTitle"),
            t("settings.alert.locationMessage"),
          );
          return;
        }
      }
      setShowLocation(value);
      setSetting(db, "showLocation", value ? "true" : "false").catch(() => {});
    },
    [db, t],
  );

  const handleToggleGpsFilter = useCallback(
    (value: boolean) => {
      setGpsFilter(value);
      setSetting(db, "gpsFilter", value ? "true" : "false").catch(() => {});
    },
    [db],
  );

  const handleDeleteAll = useCallback(() => {
    Alert.alert(
      t("settings.alert.deleteTitle"),
      t("settings.alert.deleteMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            await deleteAllTrails(db);
            resetFilters();
            setDeleting(false);
          },
        },
      ],
    );
  }, [db, t]);

  const busy = importing || deleting || dataExporting || dataImporting;

  const handleExportData = useCallback(async () => {
    setDataExporting(true);
    try {
      const fileUri = await exportTrailData(db);
      await Sharing.shareAsync(fileUri, { UTI: "public.json" });
    } catch (e) {
      Alert.alert(
        t("settings.alert.exportFailedTitle"),
        e instanceof Error ? e.message : t("common.unknownError"),
      );
    } finally {
      setDataExporting(false);
    }
  }, [db, t]);

  const handleImportData = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      setDataImporting(true);
      const {
        imported,
        skipped,
        total: fileTotal,
      } = await importTrailData(db, result.assets[0].uri);
      resetFilters();
      refreshStats();
      const skippedText =
        skipped > 0
          ? t("settings.alert.importCompleteSkipped", { skipped })
          : "";
      Alert.alert(
        t("settings.alert.importCompleteTitle"),
        t("settings.alert.importCompleteMessage", {
          imported,
          skippedText,
          total: fileTotal,
        }),
      );
    } catch (e) {
      Alert.alert(
        t("settings.alert.importFailedTitle"),
        e instanceof Error ? e.message : t("common.unknownError"),
      );
    } finally {
      setDataImporting(false);
    }
  }, [db, refreshStats, t]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Fixed header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 16,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Text style={[styles.screenTitle, { color: colors.text }]}>
          {t("settings.title")}
        </Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingBottom: 140,
        }}
      >
        {/* Appearance section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t("settings.appearance")}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.segmentedControl}>
            {THEME_OPTIONS.map((opt) => {
              const isActive = preference === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.segment,
                    {
                      backgroundColor: isActive ? colors.accent : "transparent",
                      borderColor: isActive
                        ? colors.activeSelectionBorder
                        : colors.border,
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() => setPreference(opt.value)}
                >
                  <Text style={[styles.segmentText, { color: colors.text }]}>
                    {t(opt.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Map section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t("settings.map")}
        </Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 12,
            },
          ]}
        >
          <Text style={[styles.switchLabel, { color: colors.text }]}>
            {t("settings.showLocation")}
          </Text>
          <Switch
            value={showLocation}
            onValueChange={handleToggleLocation}
            trackColor={{ true: colors.accent }}
          />
        </View>

        {/* Health Data section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t("settings.healthData")}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View
            style={[styles.statRow, { borderBottomColor: colors.borderLight }]}
          >
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {t("settings.totalTrails")}
            </Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {trailCount}
            </Text>
          </View>

          <View style={styles.statRowLast}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {t("settings.lastImport")}
            </Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {lastImport
                ? formatRelativeDate(lastImport, t)
                : t("settings.lastImportNever")}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 12,
            },
          ]}
        >
          <Text style={[styles.switchLabel, { color: colors.text }]}>
            {t("settings.gpsFilter")}
          </Text>
          <Switch
            value={gpsFilter}
            onValueChange={handleToggleGpsFilter}
            trackColor={{ true: colors.accent }}
          />
        </View>

        {/* Import progress */}
        {importing && (
          <View
            style={[
              styles.progressSection,
              {
                borderColor: colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.progressBarBg,
                {
                  backgroundColor: colors.borderLight,
                  borderColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: colors.accent,
                    width: total > 0 ? `${(progress / total) * 100}%` : "0%",
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.text }]}>
              {total > 0
                ? t("settings.importProgress", { progress, total })
                : t("settings.fetchingWorkouts")}
            </Text>
          </View>
        )}

        {error && (
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {error}
          </Text>
        )}

        {/* Import buttons */}
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              {
                backgroundColor: colors.accent,
                opacity: busy ? 0.6 : 1,
                borderWidth: 2,
                borderColor: colors.activeSelectionBorder,
              },
            ]}
            onPress={() => startImport()}
            disabled={busy}
          >
            <Text style={[styles.primaryButtonText, { color: colors.text }]}>
              {importing
                ? t("settings.importing")
                : trailCount > 0
                  ? t("settings.reimportAll")
                  : t("settings.importWorkouts")}
            </Text>
          </TouchableOpacity>

          {trailCount > 0 && (
            <TouchableOpacity
              style={[
                styles.outlinedButton,
                {
                  borderColor: colors.border,
                  opacity: busy ? 0.6 : 1,
                },
              ]}
              onPress={handleFetchNew}
              disabled={busy}
            >
              <Text style={[styles.outlinedButtonText, { color: colors.text }]}>
                {t("settings.fetchNew")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t("settings.importHint")}
        </Text>

        {/* Backup & Restore section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t("settings.backupRestore")}
        </Text>
        <View style={styles.buttonGroup}>
          {trailCount > 0 && (
            <TouchableOpacity
              style={[
                styles.outlinedButton,
                {
                  borderColor: colors.border,
                  opacity: busy ? 0.6 : 1,
                  flexDirection: "row",
                  gap: 8,
                  justifyContent: "center",
                },
              ]}
              onPress={handleExportData}
              disabled={busy}
            >
              <Feather name="upload" size={18} color={colors.text} />
              <Text style={[styles.outlinedButtonText, { color: colors.text }]}>
                {dataExporting
                  ? t("settings.exporting")
                  : t("settings.exportData")}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.outlinedButton,
              {
                borderColor: colors.border,
                opacity: busy ? 0.6 : 1,
                flexDirection: "row",
                gap: 8,
                justifyContent: "center",
              },
            ]}
            onPress={handleImportData}
            disabled={busy}
          >
            <Feather name="download" size={18} color={colors.text} />
            <Text style={[styles.outlinedButtonText, { color: colors.text }]}>
              {dataImporting
                ? t("settings.dataImporting")
                : t("settings.importFromFile")}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {trailCount > 0 ? t("settings.exportHint") : ""}
        </Text>

        {/* Delete section */}
        {trailCount > 0 && (
          <View style={styles.dangerSection}>
            <TouchableOpacity
              style={[
                styles.deleteButton,
                {
                  borderColor: colors.danger,
                  opacity: busy ? 0.6 : 1,
                },
              ]}
              onPress={handleDeleteAll}
              disabled={busy}
            >
              <Text style={[styles.deleteButtonText, { color: colors.danger }]}>
                {deleting ? t("settings.deleting") : t("settings.deleteAll")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Language section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t("settings.language")}
        </Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              padding: 0,
              overflow: "hidden",
            },
          ]}
        >
          <TouchableOpacity
            style={styles.dropdownHeader}
            onPress={() => setLangOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={[styles.dropdownHeaderText, { color: colors.text }]}>
              {LANGUAGES.find((l) => l.value === language)?.label ?? "English"}
            </Text>
            <Feather
              name={langOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
          {langOpen &&
            LANGUAGES.filter((opt) => opt.value !== language).map(
              (opt, idx, arr) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.dropdownOption,
                    {
                      borderTopColor: colors.borderLight,
                      borderTopWidth: StyleSheet.hairlineWidth,
                    },
                    idx === arr.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => {
                    setLanguage(opt.value);
                    setLangOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.dropdownOptionText, { color: colors.text }]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ),
            )}
        </View>

        <Text style={[styles.versionText, { color: colors.textSecondary }]}>
          {t("settings.version", {
            version: Constants.expoConfig?.version ?? "1.0.0",
          })}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 16,
  },
  screenTitle: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    paddingHorizontal: 20,
  },
  scrollView: {
    flex: 1,
  },
  sectionLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    letterSpacing: 1.5,
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 32,
    borderWidth: 2,
    padding: 16,
    marginBottom: 16,
  },
  segmentedControl: {
    flexDirection: "row",
    gap: 8,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
  },
  segmentText: {
    fontFamily: Fonts.semibold,
    fontSize: 15,
  },
  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownHeaderText: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  dropdownOption: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownOptionText: {
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
  switchLabel: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statRowLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  statLabel: {
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
  statValue: {
    fontFamily: Fonts.semibold,
    fontSize: 15,
  },
  progressSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: "center",
    padding: 16,
  },
  progressBarBg: {
    height: 16,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    width: "99%",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  buttonGroup: {
    marginHorizontal: 16,
    gap: 12,
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: "center",
  },
  primaryButtonText: {
    fontFamily: Fonts.semibold,
    fontSize: 16,
  },
  outlinedButton: {
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: "center",
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  outlinedButtonText: {
    fontFamily: Fonts.semibold,
    fontSize: 16,
  },
  hint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    marginHorizontal: 20,
    marginTop: 12,
    lineHeight: 16,
  },
  dangerSection: {
    marginHorizontal: 16,
    marginTop: 32,
  },
  deleteButton: {
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  deleteButtonText: {
    fontFamily: Fonts.semibold,
    fontSize: 16,
  },
  versionText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    textAlign: "center",
    marginTop: 24,
    marginBottom: 8,
  },
});
