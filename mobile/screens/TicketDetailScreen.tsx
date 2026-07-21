import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { parseISO, format } from 'date-fns';
import type { RootStackParamList } from '../lib/navigation';
import { openTicket, buildMapUrl } from '../lib/platforms';
import { PlatformBadge } from '../components/PlatformBadge';
import { colors } from '../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TicketDetail'>;

function formatDate(date: string): string {
  try {
    return format(parseISO(date), 'EEEE, MMMM d, yyyy');
  } catch {
    return date;
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function TicketDetailScreen({ route }: Props) {
  const { ticket } = route.params;
  const seatDetails = [ticket.section, ticket.row, ticket.seat]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <PlatformBadge platform={ticket.platform} />
        <Text style={styles.eventName}>{ticket.eventName}</Text>

        <View style={styles.card}>
          <DetailRow label="Date" value={formatDate(ticket.date)} />
          <DetailRow label="Time" value={ticket.time} />
          <DetailRow label="Venue" value={ticket.venue} />
          <DetailRow label="City" value={ticket.city} />
          {seatDetails ? <DetailRow label="Seating" value={seatDetails} /> : null}
          <DetailRow label="Quantity" value={String(ticket.quantity)} />
          <DetailRow label="Order #" value={ticket.orderNumber} />
        </View>

        {ticket.status === 'upcoming' && (
          <TouchableOpacity style={styles.primaryButton} onPress={() => openTicket(ticket)}>
            <Text style={styles.primaryButtonText}>Open in App</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => Linking.openURL(buildMapUrl(ticket.venue, ticket.city))}
        >
          <Text style={styles.secondaryButtonText}>View Venue on Map</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  eventName: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  rowValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});
