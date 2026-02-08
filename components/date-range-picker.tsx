import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface DateRangePickerProps {
  startDate: Date;
  endDate: Date;
  onRangeChange: (start: Date, end: Date) => void;
}

const PRESETS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: 'All', months: 120 },
] as const;

export function DateRangePicker({
  startDate,
  endDate,
  onRangeChange,
}: DateRangePickerProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const getMonthsDiff = () => {
    const diffMs = endDate.getTime() - startDate.getTime();
    return Math.round(diffMs / (30 * 24 * 60 * 60 * 1000));
  };

  const activeMonths = getMonthsDiff();

  return (
    <View style={styles.container}>
      {PRESETS.map((preset) => {
        const isActive = activeMonths === preset.months;
        return (
          <TouchableOpacity
            key={preset.label}
            style={[
              styles.chip,
              {
                backgroundColor: isActive
                  ? colors.tint
                  : colorScheme === 'dark'
                    ? '#2a2d2e'
                    : '#f0f0f0',
              },
            ]}
            onPress={() => {
              const end = new Date();
              const start = new Date();
              start.setMonth(start.getMonth() - preset.months);
              onRangeChange(start, end);
            }}>
            <Text
              style={[
                styles.chipText,
                { color: isActive ? '#fff' : colors.text },
              ]}>
              {preset.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
