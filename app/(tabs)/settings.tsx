import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useImportTrails } from '@/hooks/use-import-trails';
import { getTrailCount, getLastImportDate } from '@/lib/db';
import { useThemePreference, type ThemePreference } from '@/contexts/theme';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const db = useSQLiteContext();
  const { preference, setPreference } = useThemePreference();

  const { importing, progress, total, error, startImport } = useImportTrails();
  const [trailCount, setTrailCount] = useState(0);
  const [lastImport, setLastImport] = useState<string | null>(null);

  useEffect(() => {
    getTrailCount(db).then(setTrailCount);
    getLastImportDate(db).then(setLastImport);
  }, [db, importing]);

  const cardBg = colorScheme === 'dark' ? '#1c1e1f' : '#f5f5f5';
  const borderColor = colorScheme === 'dark' ? '#2a2d2e' : '#e5e5e5';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 80,
      }}>
      <Text style={[styles.screenTitle, { color: colors.text }]}>Settings</Text>

      {/* Appearance section */}
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>
          Appearance
        </Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((opt) => {
            const isActive = preference === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.themeChip,
                  {
                    backgroundColor: isActive
                      ? colors.tint
                      : colorScheme === 'dark'
                        ? '#2a2d2e'
                        : '#e8e8e8',
                  },
                ]}
                onPress={() => setPreference(opt.value)}>
                <Text
                  style={[
                    styles.themeChipText,
                    { color: isActive ? '#fff' : colors.text },
                  ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Import section */}
      <View style={[styles.card, { backgroundColor: cardBg, marginTop: 16 }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>
          Health Data
        </Text>

        <View
          style={[styles.statRow, { borderBottomColor: borderColor }]}>
          <Text style={[styles.statLabel, { color: colors.icon }]}>
            Imported trails
          </Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {trailCount}
          </Text>
        </View>

        <View style={styles.statRow}>
          <Text style={[styles.statLabel, { color: colors.icon }]}>
            Last import
          </Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {lastImport ? formatRelativeDate(lastImport) : 'Never'}
          </Text>
        </View>

        {/* Import progress */}
        {importing && (
          <View style={styles.progressSection}>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: colors.tint,
                    width: total > 0 ? `${(progress / total) * 100}%` : '0%',
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.icon }]}>
              {total > 0
                ? `${progress} / ${total} workouts`
                : 'Fetching workouts...'}
            </Text>
          </View>
        )}

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <TouchableOpacity
          style={[
            styles.importButton,
            {
              backgroundColor: colors.tint,
              opacity: importing ? 0.6 : 1,
            },
          ]}
          onPress={startImport}
          disabled={importing}>
          <Text style={styles.importButtonText}>
            {importing
              ? 'Importing...'
              : trailCount > 0
                ? 'Refresh Data'
                : 'Import from Health'}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.importHint, { color: colors.icon }]}>
          Imports running, walking, cycling, and hiking workouts with GPS routes
          from Apple Health.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 34,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  themeChipText: {
    fontSize: 15,
    fontWeight: '600',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  statLabel: {
    fontSize: 15,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  progressSection: {
    marginTop: 12,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 13,
    marginTop: 8,
  },
  importButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  importButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  importHint: {
    fontSize: 12,
    marginTop: 10,
    lineHeight: 16,
  },
});
