import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { getAllTrailSummaries } from '@/lib/db';
import type { TrailSummary } from '@/lib/geo';

const PRESETS = [
  { label: '1D', days: 1 },
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '6M', days: 183 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 3650 },
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
  const idx = label.lastIndexOf(', ');
  return idx >= 0 ? label.substring(idx + 2) : label;
}

function extractLocality(label: string): string {
  const idx = label.lastIndexOf(', ');
  return idx >= 0 ? label.substring(0, idx) : label;
}

function buildAreaGroups(summaries: TrailSummary[]): AreaGroup[] {
  // Group trails by their stored label
  const byLabel = new Map<string, number>();
  for (const s of summaries) {
    const label = s.locationLabel || 'Unknown';
    byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
  }

  // Group labels by city (suffix after last comma)
  const cityMap = new Map<string, { label: string; count: number }[]>();
  for (const [label, count] of byLabel) {
    const city = extractCity(label);
    if (!cityMap.has(city)) cityMap.set(city, []);
    cityMap.get(city)!.push({ label, count });
  }

  const result: AreaGroup[] = [];
  for (const [city, entries] of cityMap) {
    // Merge entries with the same locality name
    const localityMap = new Map<
      string,
      { count: number; labels: string[] }
    >();
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
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
    areaLabels?: string;
    areaLabel?: string;
  }>();

  const [startDate, setStartDate] = useState(
    params.startDate
      ? new Date(params.startDate)
      : new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000),
  );
  const [endDate, setEndDate] = useState(
    params.endDate ? new Date(params.endDate) : new Date(),
  );
  const [selectedLabels, setSelectedLabels] = useState<string[]>(() => {
    if (params.areaLabels) {
      try {
        return JSON.parse(params.areaLabels);
      } catch {}
    }
    return [];
  });
  const [selectedDisplayLabel, setSelectedDisplayLabel] = useState<string>(
    params.areaLabel ?? '',
  );
  const [showCustomStart, setShowCustomStart] = useState(false);
  const [showCustomEnd, setShowCustomEnd] = useState(false);
  const [areaGroups, setAreaGroups] = useState<AreaGroup[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      const summaries = await getAllTrailSummaries(db);
      if (cancelled) return;
      setAreaGroups(buildAreaGroups(summaries));
      setLoadingAreas(false);

      // Auto-expand group containing selected area
      if (selectedLabels.length > 0) {
        const groups = buildAreaGroups(summaries);
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

  const getActivePreset = () => {
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
    return PRESETS.find((p) => Math.abs(p.days - diffDays) <= 1)?.label ?? null;
  };

  const handlePreset = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    setStartDate(start);
    setEndDate(end);
    setShowCustomStart(false);
    setShowCustomEnd(false);
  };

  const selectArea = (labels: string[], displayLabel: string) => {
    setSelectedLabels(labels);
    setSelectedDisplayLabel(displayLabel);
  };

  const handleApply = () => {
    router.back();
    setTimeout(() => {
      router.setParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        areaLabels: JSON.stringify(selectedLabels),
        areaLabel: selectedDisplayLabel,
      });
    }, 100);
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
  const cardBg = colorScheme === 'dark' ? '#1c1e1f' : '#f5f5f5';
  const borderCol = colorScheme === 'dark' ? '#2a2d2e' : '#e5e5e5';

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingBottom: insets.bottom },
      ]}>
      {/* Fixed date range section */}
      <View style={styles.fixedSection}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Date Range
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
                    backgroundColor: isActive
                      ? colors.tint
                      : colorScheme === 'dark'
                        ? '#2a2d2e'
                        : '#f0f0f0',
                  },
                ]}
                onPress={() => handlePreset(preset.days)}>
                <Text
                  style={[
                    styles.presetText,
                    { color: isActive ? '#fff' : colors.text },
                  ]}>
                  {preset.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.dateCard, { backgroundColor: cardBg }]}>
          <TouchableOpacity
            style={styles.dateRow}
            onPress={() => {
              setShowCustomStart(!showCustomStart);
              setShowCustomEnd(false);
            }}>
            <Text style={[styles.dateLabel, { color: colors.icon }]}>From</Text>
            <Text style={[styles.dateValue, { color: colors.text }]}>
              {startDate.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </TouchableOpacity>

          {showCustomStart && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={endDate}
              onChange={(_, date) => {
                if (date) setStartDate(date);
              }}
              themeVariant={colorScheme}
            />
          )}

          <View
            style={[styles.dateSeparator, { backgroundColor: borderCol }]}
          />

          <TouchableOpacity
            style={styles.dateRow}
            onPress={() => {
              setShowCustomEnd(!showCustomEnd);
              setShowCustomStart(false);
            }}>
            <Text style={[styles.dateLabel, { color: colors.icon }]}>To</Text>
            <Text style={[styles.dateValue, { color: colors.text }]}>
              {endDate.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </TouchableOpacity>

          {showCustomEnd && (
            <DateTimePicker
              value={endDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={startDate}
              maximumDate={new Date()}
              onChange={(_, date) => {
                if (date) setEndDate(date);
              }}
              themeVariant={colorScheme}
            />
          )}
        </View>
      </View>

      {/* Scrollable area selection */}
      <View style={styles.areaSection}>
        <Text
          style={[
            styles.sectionTitle,
            styles.areaSectionTitle,
            { color: colors.text },
          ]}>
          Area
        </Text>
        {loadingAreas ? (
          <View style={styles.areaLoading}>
            <ActivityIndicator size="small" color={colors.tint} />
            <Text style={[styles.areaLoadingText, { color: colors.icon }]}>
              Loading areas...
            </Text>
          </View>
        ) : areaGroups.length > 0 && (
          <ScrollView
            style={styles.areaScroll}
            showsVerticalScrollIndicator={false}>
            <View style={[styles.areaCard, { backgroundColor: cardBg }]}>
              {areaGroups.map((group, gIdx) => {
                const hasSubs = group.subAreas.length > 1;
                const isExpanded = expandedGroups.has(gIdx);
                const groupSelected = labelsMatch(
                  selectedLabels,
                  group.allLabels,
                );
                const isLast = gIdx === areaGroups.length - 1;

                // Single sub-area: flat row
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
                          borderBottomColor: borderCol,
                        },
                      ]}
                      onPress={() => selectArea(sub.labels, sub.fullLabel)}>
                      <View
                        style={[
                          styles.radio,
                          {
                            borderColor: isActive ? colors.tint : colors.icon,
                            backgroundColor: isActive
                              ? colors.tint
                              : 'transparent',
                          },
                        ]}
                      />
                      <Text
                        style={[styles.areaLabel, { color: colors.text }]}
                        numberOfLines={1}>
                        {sub.fullLabel}
                      </Text>
                      <Text style={[styles.areaCount, { color: colors.icon }]}>
                        {sub.count}
                      </Text>
                    </TouchableOpacity>
                  );
                }

                // Multi sub-area: expandable group
                return (
                  <View key={gIdx}>
                    <TouchableOpacity
                      style={[
                        styles.areaRow,
                        !isExpanded &&
                          !isLast && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: borderCol,
                          },
                      ]}
                      onPress={() => {
                        selectArea(group.allLabels, group.label);
                        toggleGroup(gIdx);
                      }}>
                      <View
                        style={[
                          styles.radio,
                          {
                            borderColor: groupSelected
                              ? colors.tint
                              : colors.icon,
                            backgroundColor: groupSelected
                              ? colors.tint
                              : 'transparent',
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.areaLabel,
                          { color: colors.text, fontWeight: '600' },
                        ]}
                        numberOfLines={1}>
                        {group.label}
                      </Text>
                      <Text style={[styles.areaCount, { color: colors.icon }]}>
                        {group.totalCount}
                      </Text>
                      <Text style={[styles.chevron, { color: colors.icon }]}>
                        {isExpanded ? '\u25B4' : '\u25BE'}
                      </Text>
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
                                borderBottomColor: borderCol,
                              },
                            ]}
                            onPress={() =>
                              selectArea(sub.labels, sub.fullLabel)
                            }>
                            <View
                              style={[
                                styles.radioSmall,
                                {
                                  borderColor: subSelected
                                    ? colors.tint
                                    : colors.icon,
                                  backgroundColor: subSelected
                                    ? colors.tint
                                    : 'transparent',
                                },
                              ]}
                            />
                            <Text
                              style={[styles.areaLabel, { color: colors.text }]}
                              numberOfLines={1}>
                              {sub.label}
                            </Text>
                            <Text
                              style={[
                                styles.areaCount,
                                { color: colors.icon },
                              ]}>
                              {sub.count}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Apply button */}
      <View style={styles.applyContainer}>
        <TouchableOpacity
          style={[styles.applyButton, { backgroundColor: colors.tint }]}
          onPress={handleApply}>
          <Text style={styles.applyButtonText}>Apply Filters</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fixedSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  areaSection: {
    flex: 1,
    paddingHorizontal: 20,
    minHeight: 0,
  },
  areaSectionTitle: {
    marginTop: 0,
  },
  areaLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  areaLoadingText: {
    fontSize: 14,
  },
  areaScroll: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  presetText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dateCard: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  dateLabel: {
    fontSize: 15,
  },
  dateValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  dateSeparator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  areaCard: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: 15,
  },
  areaCount: {
    fontSize: 13,
  },
  chevron: {
    fontSize: 12,
    marginLeft: 4,
  },
  applyContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  applyButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
