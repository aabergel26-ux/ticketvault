import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { parseISO, format } from 'date-fns';
import type { DisplayTicket } from '../lib/types';
import { openTicket } from '../lib/platforms';
import { PlatformBadge } from './PlatformBadge';
import { colors } from '../lib/theme';

interface Props {
  ticket: DisplayTicket;
  onPress: () => void;
}

function formatDate(date: string): string {
  try {
    return format(parseISO(date), 'EEE, MMM d, yyyy');
  } catch {
    return date;
  }
}

export function TicketCard({ ticket, onPress }: Props) {
  const details = [ticket.section, ticket.row, ticket.seat]
    .filter(Boolean)
    .join(' · ');

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <PlatformBadge platform={ticket.platform} />
        {ticket.quantity > 1 && (
          <View style={styles.qtyPill}>
            <Text style={styles.qtyText}>×{ticket.quantity}</Text>
          </View>
        )}
      </View>

      <Text style={styles.eventName} numberOfLines={2}>{ticket.eventName}</Text>

      <Text style={styles.dateTime}>{formatDate(ticket.date)} · {ticket.time}</Text>
      <Text style={styles.venue} numberOfLines={1}>{ticket.venue}, {ticket.city}</Text>
      {details ? <Text style={styles.details}>{details}</Text> : null}

      {ticket.status === 'upcoming' && (
        <TouchableOpacity
          style={styles.openButton}
          onPress={(e) => {
            e.stopPropagation();
            openTicket(ticket);
          }}
        >
          <Text style={styles.openButtonText}>Open</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qtyPill: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  qtyText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  eventName: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  dateTime: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  venue: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  details: {
    color: colors.textMuted,
    fontSize: 12,
  },
  openButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  openButtonText: {
    color: colors.accentText,
    fontSize: 13,
    fontWeight: '600',
  },
});
