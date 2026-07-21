import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { Platform, ParsedTicket } from '../lib/types';
import type { RootStackParamList } from '../lib/navigation';
import type { Session } from '../lib/auth';
import { fetchTickets, syncTickets, ReconnectRequiredError } from '../lib/api';
import { cacheTickets, loadCachedTickets } from '../lib/cache';
import { dedupAndSort } from '../lib/dedupAndSort';
import { TicketCard } from '../components/TicketCard';
import { FilterBar, ACTIVE_PLATFORMS, type StatusFilter } from '../components/FilterBar';
import { colors } from '../lib/theme';

interface Props {
  session: Session;
  onSessionExpired: () => void;
}

export function TicketsScreen({ session, onSessionExpired }: Props) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [rawTickets, setRawTickets] = useState<ParsedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('upcoming');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(ACTIVE_PLATFORMS);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cached = await loadCachedTickets();
      if (cancelled) return;
      setRawTickets(cached);
      // Only show the skeleton if there's truly nothing to show yet.
      setLoading(cached.length === 0);

      try {
        const tickets = await fetchTickets(session.sessionToken, (fast) => {
          if (cancelled) return;
          setRawTickets(fast);
          cacheTickets(fast);
          setLoading(false);
        });
        if (cancelled) return;
        setRawTickets(tickets);
        cacheTickets(tickets);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ReconnectRequiredError) {
          onSessionExpired();
        } else {
          console.warn('Failed to load tickets:', err);
          setError('Could not load tickets. Pull down to try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session.sessionToken, onSessionExpired]);

  async function onRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const tickets = await syncTickets(session.sessionToken);
      setRawTickets(tickets);
      await cacheTickets(tickets);
    } catch (err) {
      if (err instanceof ReconnectRequiredError) {
        onSessionExpired();
      } else {
        console.warn('Sync failed:', err);
        setError('Sync failed. Try again.');
      }
    } finally {
      setRefreshing(false);
    }
  }

  function togglePlatform(p: Platform) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  const tickets = useMemo(() => dedupAndSort(rawTickets), [rawTickets]);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      const platformOk = selectedPlatforms.includes(t.platform);
      const statusOk =
        statusFilter === 'all' ||
        (statusFilter === 'upcoming' && t.status === 'upcoming') ||
        (statusFilter === 'past' && t.status === 'past');
      return platformOk && statusOk;
    });
  }, [tickets, selectedPlatforms, statusFilter]);

  const showSkeleton = loading && tickets.length === 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>TicketVault</Text>
        {tickets.filter((t) => t.status === 'upcoming').length > 0 && (
          <View style={styles.countPill}>
            <Text style={styles.countText}>
              {tickets.filter((t) => t.status === 'upcoming').length}
            </Text>
          </View>
        )}
      </View>

      <FilterBar
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        selectedPlatforms={selectedPlatforms}
        onPlatformToggle={togglePlatform}
      />

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {showSkeleton ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.skeletonCard}>
              <View style={styles.skeletonBadge} />
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, { width: '60%' }]} />
            </View>
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No tickets match your filters.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => (
            <TicketCard
              ticket={item}
              onPress={() => navigation.navigate('TicketDetail', { ticket: item })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  countPill: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    color: colors.accentText,
    fontSize: 12,
    fontWeight: '700',
  },
  list: {
    paddingTop: 4,
    paddingBottom: 24,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.dangerBg,
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  skeletonList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  skeletonCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  skeletonBadge: {
    width: 90,
    height: 22,
    borderRadius: 999,
    backgroundColor: colors.skeleton,
  },
  skeletonLine: {
    width: '85%',
    height: 16,
    borderRadius: 6,
    backgroundColor: colors.skeleton,
  },
});
