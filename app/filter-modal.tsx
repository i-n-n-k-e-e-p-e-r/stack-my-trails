import React, { useState, useEffect, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
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

const ACTIVITIES = [
  { type: 37, label: "Run" },
  { type: 52, label: "Walk" },
  { type: 13, label: "Cycle" },
  { type: 24, label: "Hike" },
  { type: 46, label: "Swim" },
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
  const [selectedActivities, setSelectedActivities] = useState<number[]>(
    currentFilters.activityTypes ?? [],
  );
  const [allSummaries, setAllSummaries] = useState<TrailSummary[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [dbDateRange, setDbDateRange] = useState<{
    minDate: Date;
    maxDate: Date;
  } | null>(null);

  const areaGroups = useMemo(() => {
    let filtered = allSummaries;
    filtered = filtered.filter((s) => {
      const d = new Date(s.startDate);
      return d >= startDate && d <= endDate;
    });
    if (selectedActivities.length > 0) {
      filtered = filtered.filter((s) =>
        selectedActivities.includes(s.activityType),
      );
    }
    return buildAreaGroups(filtered);
  }, [allSummaries, startDate, endDate, selectedActivities]);

  const reloadAreas = async () => {
    const summaries = await getAllTrailSummaries(db);
    setAllSummaries(summaries);
    setLoadingAreas(false);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      const summaries = await getAllTrailSummaries(db);
      const dateRange = await getTrailDateRange(db);
      if (cancelled) return;

      setAllSummaries(summaries);
      setDbDateRange(dateRange);
      setLoadingAreas(false);
    }

    loadAreas();
    return () => {
      cancelled = true;
    };
  }, [db]);

  // Auto-expand group with selected labels on initial load
  useEffect(() => {
    if (loadingAreas || selectedLabels.length === 0) return;
    for (let i = 0; i < areaGroups.length; i++) {
      if (areaGroups[i].allLabels.some((l) => selectedLabels.includes(l))) {
        setExpandedGroups(new Set([i]));
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAreas]);

  const doRename = async (labels: string[], newLabel: string) => {
    for (const oldLabel of labels) {
      await renameTrailLabel(db, oldLabel, newLabel);
    }
    const affected = selectedLabels.some((l) => labels.includes(l));
    if (affected) {
      setSelectedLabels([newLabel]);
      setSelectedDisplayLabel(newLabel);
    }
    await reloadAreas();
  };

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

        // Check if this label already exists
        const existingLabels = areaGroups.flatMap((g) =>
          g.subAreas.flatMap((s) => s.labels),
        );
        const willMerge = existingLabels.some(
          (l) => l === trimmed && !labels.includes(l),
        );

        if (willMerge) {
          Alert.alert(
            "Merge Areas?",
            `"${trimmed}" already exists. All workouts will be merged under this label.`,
            [
              { text: "Cancel", style: "cancel" },
              { text: "Merge", onPress: () => doRename(labels, trimmed) },
            ],
          );
        } else {
          await doRename(labels, trimmed);
        }
      },
      "plain-text",
      currentDisplay,
    );
  };

  const handleRenameGroup = (group: AreaGroup) => {
    Alert.prompt("Rename Group", `Current: "${group.label}"`, async (newName) => {
      if (!newName || newName.trim() === "" || newName.trim() === group.label) return;
      const trimmed = newName.trim();
      for (const oldLabel of group.allLabels) {
        const locality = extractLocality(oldLabel);
        const city = extractCity(oldLabel);
        const newLabel = locality === city ? trimmed : `${locality}, ${trimmed}`;
        await renameTrailLabel(db, oldLabel, newLabel);
      }
      if (selectedLabels.some((l) => group.allLabels.includes(l))) {
        setSelectedLabels([]);
        setSelectedDisplayLabel("");
      }
      await reloadAreas();
    }, "plain-text", group.label);
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
  };

  const selectArea = (labels: string[], displayLabel: string) => {
    setSelectedLabels(labels);
    setSelectedDisplayLabel(displayLabel);
  };

  const toggleActivity = (type: number) => {
    setSelectedActivities((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  // Drag and drop: pick up and place
  const [dragSource, setDragSource] = useState<{
    groupIdx: number;
    labels: string[];
    displayLabel: string;
  } | null>(null);

  const handleStartDrag = (
    groupIdx: number,
    labels: string[],
    displayLabel: string,
  ) => {
    setDragSource({ groupIdx, labels, displayLabel });
  };

  const handleDropOnGroup = async (targetGroupIdx: number) => {
    if (!dragSource || targetGroupIdx === dragSource.groupIdx) {
      setDragSource(null);
      return;
    }

    const targetCity = areaGroups[targetGroupIdx].label;
    const targetAllLabels = areaGroups[targetGroupIdx].allLabels;

    // Check for merges
    const newLabels = dragSource.labels.map(
      (l) => `${extractLocality(l)}, ${targetCity}`,
    );
    const willMerge = newLabels.some((nl) => targetAllLabels.includes(nl));

    const doMove = async () => {
      for (const oldLabel of dragSource.labels) {
        const newLabel = `${extractLocality(oldLabel)}, ${targetCity}`;
        await renameTrailLabel(db, oldLabel, newLabel);
      }
      const affected = selectedLabels.some((l) =>
        dragSource.labels.includes(l),
      );
      if (affected) {
        setSelectedLabels([]);
        setSelectedDisplayLabel("");
      }
      setDragSource(null);
      await reloadAreas();
    };

    if (willMerge) {
      Alert.alert(
        "Merge Areas?",
        `Some areas will merge with existing areas in "${targetCity}". All workouts will be combined.`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => setDragSource(null),
          },
          { text: "Merge", onPress: doMove },
        ],
      );
    } else {
      await doMove();
    }
  };

  const handleDropToRoot = async () => {
    if (!dragSource) return;

    const newLabels: string[] = [];
    for (const oldLabel of dragSource.labels) {
      const locality = extractLocality(oldLabel);
      const city = extractCity(oldLabel);
      if (locality === city) {
        // Already at root level, nothing to do
        newLabels.push(oldLabel);
        continue;
      }
      newLabels.push(locality);
      await renameTrailLabel(db, oldLabel, locality);
    }

    const affected = selectedLabels.some((l) =>
      dragSource.labels.includes(l),
    );
    if (affected) {
      setSelectedLabels(newLabels);
      setSelectedDisplayLabel(newLabels[0] ?? "");
    }
    setDragSource(null);
    await reloadAreas();
  };

  const handleApply = () => {
    setFilters({
      startDate,
      endDate,
      areaLabels: selectedLabels.length > 0 ? selectedLabels : null,
      areaLabel: selectedDisplayLabel || null,
      activityTypes: selectedActivities.length > 0 ? selectedActivities : null,
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
            styles.datePickerRow,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.datePickerCol}>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
              From:
            </Text>
            <DateTimePicker
              value={startDate}
              mode="date"
              display="compact"
              maximumDate={endDate}
              onChange={(_, date) => {
                if (date) setStartDate(date);
              }}
              themeVariant={colorScheme}
              accentColor={colors.text}
            />
          </View>
          <View style={styles.datePickerCol}>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
              To:
            </Text>
            <DateTimePicker
              value={endDate}
              mode="date"
              display="compact"
              minimumDate={startDate}
              onChange={(_, date) => {
                if (date) setEndDate(date);
              }}
              themeVariant={colorScheme}
              accentColor={colors.text}
            />
          </View>
        </View>

        {/* Activities section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          ACTIVITIES
        </Text>
        <View style={styles.activityWrap}>
          {ACTIVITIES.map((act) => {
            const isActive = selectedActivities.includes(act.type);
            return (
              <TouchableOpacity
                key={act.type}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: isActive ? colors.accent : "transparent",
                    borderColor: isActive
                      ? colors.activeSelectionBorder
                      : colors.border,
                  },
                ]}
                onPress={() => toggleActivity(act.type)}
              >
                <Text
                  style={[
                    styles.presetText,
                    { color: colors.text },
                  ]}
                >
                  {act.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Areas section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          AREAS
        </Text>

        {dragSource && (
          <View style={styles.dragBannerWrap}>
            <View
              style={[
                styles.dragBanner,
                {
                  backgroundColor: colors.accent,
                  borderColor: colors.activeSelectionBorder,
                },
              ]}
            >
              <Text
                style={[styles.dragBannerText, { color: colors.text }]}
                numberOfLines={1}
              >
                Move "{dragSource.displayLabel}"
              </Text>
              <TouchableOpacity onPress={() => setDragSource(null)}>
                <Feather name="x" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[
                styles.dropRootZone,
                {
                  borderColor: colors.border,
                },
              ]}
              onPress={handleDropToRoot}
            >
              <Feather
                name="corner-left-up"
                size={14}
                color={colors.textSecondary}
              />
              <Text
                style={[
                  styles.dropRootText,
                  { color: colors.textSecondary },
                ]}
              >
                Move to top level
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {loadingAreas ? (
          <View style={styles.areaLoading}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text
              style={[styles.areaLoadingText, { color: colors.textSecondary }]}
            >
              Loading areas...
            </Text>
          </View>
        ) : areaGroups.length === 0 ? (
          <View style={styles.areaLoading}>
            <Text
              style={[styles.areaLoadingText, { color: colors.textSecondary }]}
            >
              No areas match the current filters
            </Text>
          </View>
        ) : (
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
                  const isDragSource =
                    dragSource?.groupIdx === gIdx;
                  const isDropTarget =
                    dragSource !== null && dragSource.groupIdx !== gIdx;

                  return (
                    <TouchableOpacity
                      key={gIdx}
                      style={[
                        styles.areaRow,
                        !isLast && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.borderLight,
                        },
                        isDragSource && { opacity: 0.4 },
                        isDropTarget && {
                          backgroundColor: `${colors.accent}30`,
                        },
                      ]}
                      onPress={() => {
                        if (dragSource) {
                          handleDropOnGroup(gIdx);
                          return;
                        }
                        selectArea(sub.labels, sub.fullLabel);
                      }}
                      onLongPress={() =>
                        handleStartDrag(gIdx, sub.labels, sub.fullLabel)
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
                      <TouchableOpacity
                        onPress={() =>
                          handleRenameLabel(sub.labels, sub.fullLabel)
                        }
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        style={styles.editButton}
                      >
                        <Feather
                          name="edit-3"
                          size={14}
                          color={colors.textSecondary}
                        />
                      </TouchableOpacity>
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

                const isDragSourceGroup =
                  dragSource?.groupIdx === gIdx;
                const isDropTargetGroup =
                  dragSource !== null && dragSource.groupIdx !== gIdx;

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
                        isDropTargetGroup && {
                          backgroundColor: `${colors.accent}30`,
                        },
                      ]}
                      onPress={() => {
                        if (dragSource) {
                          handleDropOnGroup(gIdx);
                          return;
                        }
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
                      <TouchableOpacity
                        onPress={() =>
                          handleRenameGroup(group)
                        }
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        style={styles.editButton}
                      >
                        <Feather
                          name="edit-3"
                          size={14}
                          color={colors.textSecondary}
                        />
                      </TouchableOpacity>
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
                        const isSubDragSource =
                          dragSource !== null &&
                          dragSource.groupIdx === gIdx &&
                          labelsMatch(dragSource.labels, sub.labels);

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
                              isSubDragSource && { opacity: 0.4 },
                            ]}
                            onPress={() =>
                              selectArea(sub.labels, sub.fullLabel)
                            }
                            onLongPress={() =>
                              handleStartDrag(gIdx, sub.labels, sub.fullLabel)
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
                            <TouchableOpacity
                              onPress={() =>
                                handleRenameLabel(sub.labels, sub.fullLabel)
                              }
                              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                              style={styles.editButton}
                            >
                              <Feather
                                name="edit-3"
                                size={14}
                                color={colors.textSecondary}
                              />
                            </TouchableOpacity>
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
  activityWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  datePickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 32,
    borderWidth: 2,
    overflow: "hidden",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  datePickerCol: {
    flex: 1,
    alignItems: "flex-start",
    gap: 4,
    transform: [{ scale: 0.85 }],
  },
  dateLabel: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    letterSpacing: 1,
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
  editButton: {
    padding: 4,
  },
  dragBannerWrap: {
    gap: 8,
    marginBottom: 12,
  },
  dragBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  dragBannerText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  dropRootZone: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 2,
    borderStyle: "dashed",
    paddingVertical: 10,
  },
  dropRootText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
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
