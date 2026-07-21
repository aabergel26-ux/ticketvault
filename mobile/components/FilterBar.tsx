import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import type { Platform } from '../lib/types';
import { PLATFORMS } from '../lib/platforms';
import { colors } from '../lib/theme';

export type StatusFilter = 'all' | 'upcoming' | 'past';

export const ACTIVE_PLATFORMS: Platform[] = ['ticketmaster', 'axs', 'dice', 'stubhub'];

interface Props {
  statusFilter: StatusFilter;
  onStatusChange: (f: StatusFilter) => void;
  selectedPlatforms: Platform[];
  onPlatformToggle: (p: Platform) => void;
}

const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'all', label: 'All' },
];

export function FilterBar({ statusFilter, onStatusChange, selectedPlatforms, onPlatformToggle }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        {STATUS_OPTIONS.map((opt) => {
          const active = statusFilter === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.statusPill, active && styles.statusPillActive]}
              onPress={() => onStatusChange(opt.id)}
            >
              <Text style={[styles.statusText, active && styles.statusTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.platformRow}
      >
        {ACTIVE_PLATFORMS.map((p) => {
          const config = PLATFORMS[p];
          const active = selectedPlatforms.includes(p);
          return (
            <TouchableOpacity
              key={p}
              style={[
                styles.platformChip,
                { borderColor: active ? config.color : colors.border },
                active && { backgroundColor: config.color },
              ]}
              onPress={() => onPlatformToggle(p)}
            >
              <Text style={[styles.platformText, active && { color: config.textColor }]}>
                {config.logo} {config.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  statusPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  statusPillActive: {
    backgroundColor: colors.accent,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  statusTextActive: {
    color: colors.accentText,
  },
  platformRow: {
    gap: 8,
  },
  platformChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  platformText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
