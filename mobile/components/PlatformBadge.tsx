import { View, Text, StyleSheet } from 'react-native';
import type { Platform } from '../lib/types';
import { PLATFORMS } from '../lib/platforms';

export function PlatformBadge({ platform }: { platform: Platform }) {
  const config = PLATFORMS[platform];
  return (
    <View style={[styles.badge, { backgroundColor: config.color }]}>
      <Text style={[styles.text, { color: config.textColor }]}>
        {config.logo} {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
