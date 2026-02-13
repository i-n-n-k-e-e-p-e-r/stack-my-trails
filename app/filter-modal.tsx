import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, Fonts } from "@/constants/theme";
import {
  getAllTrailSummaries,
  renameTrailLabel,
  getTrailDateRange,
} from "@/lib/db";
import { getFilters, setFilters } from "@/lib/filter-store";
import type { TrailSummary } from "@/lib/geo";

const PRESETS = [
  { label: "1D", days: 1 },
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "1Y", days: 365 },
  { label: "All", days: 3650 },
] as const;

interface SubArea {
  label: string;
  fullLabel: string;
  count: number;
  labels: string[];
}

interface AreaGroup {
  label: string;
  subAreas: SubArea[];
  totalCount: number;
  allLabels: string[];
}

function extractCity(label: string): string {
  const idx = label.lastIndexOf(", ");
  return idx >= 0 ? label.substring(idx + 2) : label;
}

function extractLocality(label: string): string {
  const idx = label.lastIndexOf(", ");
  return idx >= 0 ? label.substring(0, idx) : label;
}

function buildAreaGroups(summaries: TrailSummary[]): AreaGroup[] {
  const byLabel = new Map<string, number>();
  for (const s of summaries) {
    const label = s.locationLabel || "Unknown";
    byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
  }

  const cityMap = new Map<string, { label: string; count: number }[]>();
  for (const [label, count] of byLabel) {
    const city = extractCity(label);
    if (!cityMap.has(city)) cityMap.set(city, []);
    cityMap.get(city)!.push({ label, count });
  }

  const result: AreaGroup[] = [];
  for (const [city, entries] of cityMap) {
    const localityMap = new Map<string, { count: number; labels: string[] }>();
    for (const e of entries) {
      const locality = extractLocality(e.label);
      const existing = localityMap.get(locality);
      if (existing) {
        existing.count += e.count;
        existing.labels.push(e.label);
      } else {
        localityMap.set(locality, { count: e.count, labels: [e.label] });
      }
    }

    const subAreas: SubArea[] = [...localityMap.entries()]
      .map(([locality, data]) => ({
        label: locality,
        fullLabel: locality === city ? city : `${locality}, ${city}`,
        count: data.count,
        labels: data.labels,
      }))
      .sort((a, b) => b.count - a.count);

    const totalCount = subAreas.reduce((s, a) => s + a.count, 0);
    const allLabels = entries.map((e) => e.label);

    result.push({ label: city, subAreas, totalCount, allLabels });
  }

  return result.sort((a, b) => b.totalCount - a.totalCount);
}

export default function FilterModal() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const router = useRouter();
  const db = useSQLiteContext();
  const currentFilters = getFilters();

  const [startDate, setStartDate] = useState(currentFilters.startDate);
  const [endDate, setEndDate] = useState(currentFilters.endDate);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(
    currentFilters.areaLabels ?? [],
  );
  const [selectedDisplayLabel, setSelectedDisplayLabel] = useState<string>(
    currentFilters.areaLabel ?? "",
  );
  const [showCustomStart, setShowCustomStart] = useState(false);
  const [showCustomEnd, setShowCustomEnd] = useState(false);
  const [areaGroups, setAreaGroups] = useState<AreaGroup[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [dbDateRange, setDbDateRange] = useState<{
    minDate: Date;
    maxDate: Date;
  } | null>(null);

  const reloadAreas = async () => {
    const summaries = await getAllTrailSummaries(db);
    const groups = buildAreaGroups(summaries);
    setAreaGroups(groups);
    setLoadingAreas(false);
    return groups;
  };

  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      const groups = await reloadAreas();
      const dateRange = await getTrailDateRange(db);
      if (cancelled) return;

      setDbDateRange(dateRange);

      if (selectedLabels.length > 0) {
        for (let i = 0; i < groups.length; i++) {
          const hasMatch = groups[i].allLabels.some((l) =>
            selectedLabels.includes(l),
          );
          if (hasMatch) {
            setExpandedGroups(new Set([i]));
            break;
          }
        }
      }
    }

    loadAreas();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  const handleRenameLabel = (labels: string[], currentDisplay: string) => {
    Alert.prompt(
      "Rename Area",
      `Current: "${currentDisplay}"`,
      async (newName) => {
        if (
          !newName ||
          newName.trim() === "" ||
          newName.trim() === currentDisplay
        )
          return;
        const trimmed = newName.trim();
        for (const oldLabel of labels) {
          await renameTrailLabel(db, oldLabel, trimmed);
        }
        // Update selected labels if they were affected
        const affected = selectedLabels.some((l) => labels.includes(l));
        if (affected) {
          setSelectedLabels([trimmed]);
          setSelectedDisplayLabel(trimmed);
        }
        await reloadAreas();
      },
      "plain-text",
      currentDisplay,
    );
  };

  const getActivePreset = () => {
    // Check if "All" preset is active by comparing with database date range
    if (dbDateRange) {
      const isAllPreset =
        Math.abs(startDate.getTime() - dbDateRange.minDate.getTime()) < 1000 &&
        Math.abs(endDate.getTime() - dbDateRange.maxDate.getTime()) < 1000;
      if (isAllPreset) return "All";
    }

    // Check other presets by day difference
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
    return (
      PRESETS.find((p) => p.label !== "All" && Math.abs(p.days - diffDays) <= 1)
        ?.label ?? null
    );
  };

  const handlePreset = async (days: number) => {
    const now = new Date();

    // For "All" preset, use actual database date range
    if (days >= 3650) {
      const dateRange = await getTrailDateRange(db);
      if (dateRange) {
        setStartDate(dateRange.minDate);
        setEndDate(dateRange.maxDate);
      } else {
        // Fallback if no data
        const start = new Date(
          now.getTime() - (days / 2) * 24 * 60 * 60 * 1000,
        );
        const end = new Date(now.getTime() + (days / 2) * 24 * 60 * 60 * 1000);
        setStartDate(start);
        setEndDate(end);
      }
    } else {
      // Other presets: backwards from today
      const end = now;
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
      setStartDate(start);
      setEndDate(end);
    }
    setShowCustomStart(false);
    setShowCustomEnd(false);
  };

  const selectArea = (labels: string[], displayLabel: string) => {
    setSelectedLabels(labels);
    setSelectedDisplayLabel(displayLabel);
  };

  const handleApply = () => {
    setFilters({
      startDate,
      endDate,
      areaLabels: selectedLabels.length > 0 ? selectedLabels : null,
      areaLabel: selectedDisplayLabel || null,
    });
    router.back();
  };

  const toggleGroup = (idx: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const labelsMatch = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false;
    return a.every((l) => b.includes(l));
  };

  const activePreset = getActivePreset();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingBottom: insets.bottom },
      ]}
    >
      {/* Drag handle */}
      <View style={styles.handleContainer}>
        <View
          style={[styles.handle, { backgroundColor: colors.borderLight }]}
        />
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentInner}
        showsVerticalScrollIndicator={false}
      >
        {/* Date range section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          DATE RANGE
        </Text>

        <View style={styles.presetRow}>
          {PRESETS.map((preset) => {
            const isActive = activePreset === preset.label;
            return (
              <TouchableOpacity
                key={preset.label}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: isActive ? colors.accent : "transparent",
                    borderColor: isActive
                      ? colors.activeSelectionBorder
                      : colors.border,
                  },
                ]}
                onPress={() => handlePreset(preset.days)}
              >
                <Text
                  style={[
                    styles.presetText,
                    {
                      color: colors.text,
                    },
                  ]}
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View
          style={[
            styles.dateCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <TouchableOpacity
            style={styles.dateRow}
            onPress={() => {
              setShowCustomStart(!showCustomStart);
              setShowCustomEnd(false);
            }}
          >
            <Text style={[styles.dateChevron, { color: colors.textSecondary }]}>
              {showCustomStart ? "\u25B4" : "\u25BE"}
            </Text>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
              From
            </Text>
            <Text
              style={[styles.dateValue, { color: colors.text }]}
              numberOfLines={1}
            >
              {startDate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </TouchableOpacity>

          {showCustomStart && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              maximumDate={endDate}
              onChange={(_, date) => {
                if (date) setStartDate(date);
              }}
              themeVariant={colorScheme}
              accentColor={colors.text}
            />
          )}

          <View
            style={[
              styles.dateSeparator,
              { backgroundColor: colors.borderLight },
            ]}
          />

          <TouchableOpacity
            style={styles.dateRow}
            onPress={() => {
              setShowCustomEnd(!showCustomEnd);
              setShowCustomStart(false);
            }}
          >
            <Text style={[styles.dateChevron, { color: colors.textSecondary }]}>
              {showCustomEnd ? "\u25B4" : "\u25BE"}
            </Text>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
              To
            </Text>
            <Text
              style={[styles.dateValue, { color: colors.text }]}
              numberOfLines={1}
            >
              {endDate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </TouchableOpacity>

          {showCustomEnd && (
            <DateTimePicker
              value={endDate}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              minimumDate={startDate}
              onChange={(_, date) => {
                if (date) setEndDate(date);
              }}
              themeVariant={colorScheme}
              accentColor={colors.text}
            />
          )}
        </View>

        {/* Areas section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          AREAS
        </Text>
        {loadingAreas ? (
          <View style={styles.areaLoading}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text
              style={[styles.areaLoadingText, { color: colors.textSecondary }]}
            >
              Loading areas...
            </Text>
          </View>
        ) : (
          areaGroups.length > 0 && (
            <View
              style={[
                styles.areaCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              {areaGroups.map((group, gIdx) => {
                const hasSubs = group.subAreas.length > 1;
                const isExpanded = expandedGroups.has(gIdx);
                const groupSelected = labelsMatch(
                  selectedLabels,
                  group.allLabels,
                );
                const isLast = gIdx === areaGroups.length - 1;

                if (!hasSubs) {
                  const sub = group.subAreas[0];
                  const isActive = labelsMatch(selectedLabels, sub.labels);

                  return (
                    <TouchableOpacity
                      key={gIdx}
                      style={[
                        styles.areaRow,
                        !isLast && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.borderLight,
                        },
                      ]}
                      onPress={() => selectArea(sub.labels, sub.fullLabel)}
                      onLongPress={() =>
                        handleRenameLabel(sub.labels, sub.fullLabel)
                      }
                    >
                      <View
                        style={[
                          styles.radio,
                          {
                            borderColor: isActive
                              ? colors.accent
                              : colors.textSecondary,
                            backgroundColor: isActive
                              ? colors.accent
                              : "transparent",
                          },
                        ]}
                      />
                      <Text
                        style={[styles.areaLabel, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {sub.fullLabel}
                      </Text>
                      <View
                        style={[
                          styles.countPill,
                          { borderColor: colors.border, borderWidth: 1 },
                        ]}
                      >
                        <Text
                          style={[styles.countPillText, { color: colors.text }]}
                        >
                          {sub.count}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }

                return (
                  <View key={gIdx}>
                    <TouchableOpacity
                      style={[
                        styles.areaRow,
                        !isExpanded &&
                          !isLast && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: colors.borderLight,
                          },
                      ]}
                      onPress={() => {
                        selectArea(group.allLabels, group.label);
                        toggleGroup(gIdx);
                      }}
                    >
                      <View
                        style={[
                          styles.radio,
                          {
                            borderColor: groupSelected
                              ? colors.accent
                              : colors.textSecondary,
                            backgroundColor: groupSelected
                              ? colors.accent
                              : "transparent",
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.areaLabel,
                          { color: colors.text, fontFamily: Fonts.medium },
                        ]}
                        numberOfLines={1}
                      >
                        {group.label}
                      </Text>
                      <Text
                        style={[
                          styles.chevron,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {isExpanded ? "\u25B4" : "\u25BE"}
                      </Text>
                      <View
                        style={[
                          styles.countPill,
                          { borderColor: colors.border, borderWidth: 1 },
                        ]}
                      >
                        <Text
                          style={[styles.countPillText, { color: colors.text }]}
                        >
                          {group.totalCount}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {isExpanded &&
                      group.subAreas.map((sub, sIdx) => {
                        const subSelected = labelsMatch(
                          selectedLabels,
                          sub.labels,
                        );
                        const subIsLast =
                          sIdx === group.subAreas.length - 1 && isLast;

                        return (
                          <TouchableOpacity
                            key={sIdx}
                            style={[
                              styles.areaRow,
                              styles.subAreaRow,
                              !subIsLast && {
                                borderBottomWidth: StyleSheet.hairlineWidth,
                                borderBottomColor: colors.borderLight,
                              },
                            ]}
                            onPress={() =>
                              selectArea(sub.labels, sub.fullLabel)
                            }
                            onLongPress={() =>
                              handleRenameLabel(sub.labels, sub.fullLabel)
                            }
                          >
                            <View
                              style={[
                                styles.radioSmall,
                                {
                                  borderColor: subSelected
                                    ? colors.accent
                                    : colors.textSecondary,
                                  backgroundColor: subSelected
                                    ? colors.accent
                                    : "transparent",
                                },
                              ]}
                            />
                            <Text
                              style={[styles.areaLabel, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {sub.label}
                            </Text>
                            <View
                              style={[
                                styles.countPill,
                                {
                                  borderColor: colors.border,
                                  borderWidth: 1,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.countPillText,
                                  { color: colors.text },
                                ]}
                              >
                                {sub.count}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                );
              })}
            </View>
          )
        )}
      </ScrollView>

      {/* Apply button — always at bottom */}
      <View style={styles.applyContainer}>
        <TouchableOpacity
          style={[
            styles.applyButton,
            {
              backgroundColor: colors.accent,
              borderColor: colors.activeSelectionBorder,
              opacity: selectedLabels.length === 0 ? 0.4 : 1,
            },
          ]}
          onPress={handleApply}
          disabled={selectedLabels.length === 0}
        >
          <Text style={[styles.applyButtonText, { color: colors.text }]}>
            Apply Filters
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentInner: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  areaLoading: {
    paddingVertical: 40,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  areaLoadingText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
  },
  sectionLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 12,
    marginTop: 8,
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 2,
  },
  presetText: {
    fontFamily: Fonts.semibold,
    fontSize: 13,
  },
  dateCard: {
    borderRadius: 32,
    borderWidth: 2,
    overflow: "hidden",
    marginBottom: 24,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 6,
  },
  dateLabel: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    flexShrink: 0,
  },
  dateValue: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    marginLeft: "auto",
    flexShrink: 1,
    textAlign: "right",
  },
  dateChevron: {
    fontSize: 12,
    flexShrink: 0,
  },
  dateSeparator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  areaCard: {
    borderRadius: 32,
    borderWidth: 2,
    overflow: "hidden",
  },
  areaRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  subAreaRow: {
    paddingLeft: 40,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  radioSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  areaLabel: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  countPillText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
  },
  chevron: {
    fontSize: 14,
    marginLeft: 4,
  },
  applyContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundBlendMode: "overlay",
  },
  applyButton: {
    borderWidth: 2,
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
  },
  applyButtonText: {
    fontFamily: Fonts.semibold,
    fontSize: 17,
  },
});
