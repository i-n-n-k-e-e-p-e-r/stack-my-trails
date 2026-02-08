import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { getAllTrailSummaries, getCachedLabel } from '@/lib/db';
import { clusterTrails, bboxCenter } from '@/lib/geo';

const PRESETS = [
  { label: '1D', days: 1 },
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '6M', days: 183 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 3650 },
] as const;

interface ClusterInfo {
  id: string;
  label: string;
  count: number;
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
    clusterId?: string;
  }>();

  const [startDate, setStartDate] = useState(
    params.startDate ? new Date(params.startDate) : new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000),
  );
  const [endDate, setEndDate] = useState(
    params.endDate ? new Date(params.endDate) : new Date(),
  );
  const [selectedClusterId, setSelectedClusterId] = useState(
    params.clusterId || null,
  );
  const [showCustomStart, setShowCustomStart] = useState(false);
  const [showCustomEnd, setShowCustomEnd] = useState(false);
  const [clusterList, setClusterList] = useState<ClusterInfo[]>([]);

  // Load all areas from DB
  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      const summaries = await getAllTrailSummaries(db);
      const clusters = clusterTrails(summaries);

      const areas: ClusterInfo[] = [];
      for (const cluster of clusters) {
        const center = bboxCenter(cluster.boundingBox);
        const cached = await getCachedLabel(db, center.latitude, center.longitude);
        areas.push({
          id: cluster.id,
          label: cached ?? `${center.latitude.toFixed(1)}, ${center.longitude.toFixed(1)}`,
          count: cluster.summaries.length,
        });
      }

      if (!cancelled) setClusterList(areas);
    }

    loadAreas();
    return () => { cancelled = true; };
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

  const handleApply = () => {
    router.back();
    setTimeout(() => {
      router.setParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        clusterId: selectedClusterId ?? '',
      });
    }, 100);
  };

  const activePreset = getActivePreset();
  const cardBg = colorScheme === 'dark' ? '#1c1e1f' : '#f5f5f5';

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
            style={[
              styles.dateSeparator,
              { backgroundColor: colorScheme === 'dark' ? '#2a2d2e' : '#e5e5e5' },
            ]}
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
      {clusterList.length > 0 && (
        <View style={styles.areaSection}>
          <Text style={[styles.sectionTitle, styles.areaSectionTitle, { color: colors.text }]}>
            Area
          </Text>
          <ScrollView
            style={styles.areaScroll}
            contentContainerStyle={styles.areaScrollContent}
            showsVerticalScrollIndicator={false}>
            <View style={[styles.areaCard, { backgroundColor: cardBg }]}>
              {clusterList.map((cluster, idx) => {
                const isActive = cluster.id === selectedClusterId;
                return (
                  <TouchableOpacity
                    key={cluster.id}
                    style={[
                      styles.areaRow,
                      idx < clusterList.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor:
                          colorScheme === 'dark' ? '#2a2d2e' : '#e5e5e5',
                      },
                    ]}
                    onPress={() => setSelectedClusterId(cluster.id)}>
                    <View
                      style={[
                        styles.radio,
                        {
                          borderColor: isActive ? colors.tint : colors.icon,
                          backgroundColor: isActive ? colors.tint : 'transparent',
                        },
                      ]}
                    />
                    <Text
                      style={[styles.areaLabel, { color: colors.text }]}
                      numberOfLines={1}>
                      {cluster.label}
                    </Text>
                    <Text style={[styles.areaCount, { color: colors.icon }]}>
                      {cluster.count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

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
  areaScroll: {
    flex: 1,
  },
  areaScrollContent: {
    paddingBottom: 8,
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
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  areaLabel: {
    flex: 1,
    fontSize: 15,
  },
  areaCount: {
    fontSize: 13,
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
