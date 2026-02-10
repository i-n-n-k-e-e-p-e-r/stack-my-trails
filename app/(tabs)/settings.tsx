import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, Fonts } from "@/constants/theme";
import { useImportTrails } from "@/hooks/use-import-trails";
import {
  getTrailCount,
  getLastImportDate,
  getLatestTrailDate,
  deleteAllTrails,
} from "@/lib/db";
import { useThemePreference, type ThemePreference } from "@/contexts/theme";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
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

  const { importing, progress, total, error, startImport } = useImportTrails();
  const [trailCount, setTrailCount] = useState(0);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refreshStats = useCallback(() => {
    getTrailCount(db).then(setTrailCount);
    getLastImportDate(db).then(setLastImport);
  }, [db]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats, importing, deleting]);

  const handleFetchNew = useCallback(async () => {
    const latest = await getLatestTrailDate(db);
    startImport(latest);
  }, [db, startImport]);

  const handleDeleteAll = useCallback(() => {
    Alert.alert(
      "Delete All Data",
      "This will remove all imported trails and cached labels. You will need to re-import from Health.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            await deleteAllTrails(db);
            setDeleting(false);
          },
        },
      ],
    );
  }, [db]);

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
          Settings
        </Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingBottom: 24,
        }}
      >
        {/* Appearance section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          APPEARANCE
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
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Health Data section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          HEALTH DATA
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
              Total trails
            </Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {trailCount}
            </Text>
          </View>

          <View style={styles.statRowLast}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Last import
            </Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {lastImport ? formatRelativeDate(lastImport) : "Never"}
            </Text>
          </View>
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
                ? `${progress} / ${total} workouts`
                : "Fetching workouts..."}
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
                opacity: importing ? 0.6 : 1,
                borderWidth: 2,
                borderColor: colors.activeSelectionBorder,
              },
            ]}
            onPress={() => startImport()}
            disabled={importing}
          >
            <Text style={[styles.primaryButtonText, { color: colors.text }]}>
              {importing
                ? "Importing..."
                : trailCount > 0
                  ? "Re-import All"
                  : "Import from Health"}
            </Text>
          </TouchableOpacity>

          {trailCount > 0 && (
            <TouchableOpacity
              style={[
                styles.outlinedButton,
                {
                  borderColor: colors.border,
                  opacity: importing ? 0.6 : 1,
                },
              ]}
              onPress={handleFetchNew}
              disabled={importing}
            >
              <Text style={[styles.outlinedButtonText, { color: colors.text }]}>
                Fetch New Routes
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Imports running, walking, cycling, hiking, and open water swimming
          workouts with GPS routes from Apple Health.
        </Text>

        {/* Data section */}
        {trailCount > 0 && (
          <View style={styles.dangerSection}>
            <TouchableOpacity
              style={[
                styles.deleteButton,
                {
                  borderColor: colors.danger,
                  opacity: importing || deleting ? 0.6 : 1,
                },
              ]}
              onPress={handleDeleteAll}
              disabled={importing || deleting}
            >
              <Text style={[styles.deleteButtonText, { color: colors.danger }]}>
                {deleting ? "Deleting..." : "Delete All Data"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Fixed footer */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom - 20,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          © Stack My Trails v1.0
        </Text>
      </View>
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
  footer: {
    paddingTop: 16,
    alignItems: "center",
  },
  footerText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    textAlign: "center",
  },
});
