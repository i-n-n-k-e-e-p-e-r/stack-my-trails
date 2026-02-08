import React from 'react';
import {
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import type { TrailCluster } from '@/lib/geo';

interface AreaPickerProps {
  clusters: TrailCluster[];
  selectedClusterId: string | null;
  onSelect: (clusterId: string) => void;
}

export function AreaPicker({
  clusters,
  selectedClusterId,
  onSelect,
}: AreaPickerProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  if (clusters.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      {clusters.map((cluster) => {
        const isActive = cluster.id === selectedClusterId;
        return (
          <TouchableOpacity
            key={cluster.id}
            style={[
              styles.chip,
              {
                backgroundColor: isActive
                  ? colors.tint
                  : colorScheme === 'dark'
                    ? '#2a2d2e'
                    : '#f0f0f0',
                borderColor: isActive ? colors.tint : 'transparent',
              },
            ]}
            onPress={() => onSelect(cluster.id)}>
            <Text
              style={[
                styles.label,
                { color: isActive ? '#fff' : colors.text },
              ]}
              numberOfLines={1}>
              {cluster.label || 'Loading...'}
            </Text>
            <Text
              style={[
                styles.count,
                {
                  color: isActive
                    ? 'rgba(255,255,255,0.7)'
                    : colors.icon,
                },
              ]}>
              {cluster.trails.length}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    maxWidth: 150,
  },
  count: {
    fontSize: 12,
    fontWeight: '500',
  },
});
