import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Platform, ParsedTicket, DisplayTicket } from './types';
import { Header } from './components/Header';
import { ConnectGmail } from './components/ConnectGmail';
import { FilterBar } from './components/FilterBar';
import { TicketCard } from './components/TicketCard';
import { toDisplayTicket } from './lib/platforms';
import {
  startGoogleAuth,
  detectAuthCode,
  exchangeAuthCode,
  fetchTicketsForAccount,
  loadAccounts,
  saveAccounts,
  clearAccounts,
  signOutAccounts,
  getAllCachedTickets,
  type Account,
} from './lib/auth';
import './index.css';

type StatusFilter = 'all' | 'upcoming' | 'past';

const ACTIVE_PLATFORMS: Platform[] = ['ticketmaster', 'axs', 'dice', 'stubhub'];

// ─── Dedup + sort logic (shared between cache load and fresh sync) ──────────

const PLATFORM_PRIORITY: Record<string, number> = {
  dice: 5, axs: 4, ticketmaster: 3, tickpick: 2, stubhub: 1,
};

function normalizeName(n: string): string {
  return n.toLowerCase()
    .replace(/\s*&\s*guests?\b/g, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function timeToMins(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 720;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function dedupAndSort(tickets: ParsedTicket[]): DisplayTicket[] {
  // Dedup: normalized name + date, keep highest-priority platform, MAX quantity
  const groups = new Map<string, ParsedTicket[]>();
  for (const t of tickets) {
    const key = `${normalizeName(t.eventName)}|${t.date}`;
    const g = groups.get(key);
    if (g) g.push(t); else groups.set(key, [t]);
  }
  const deduped = Array.from(groups.values()).map((group) => {
    const rep = group.reduce(
      (best, t) => (PLATFORM_PRIORITY[t.platform] ?? 0) > (PLATFORM_PRIORITY[best.platform] ?? 0) ? t : best,
      group[0]
    );
    return { ...rep, quantity: Math.max(...group.map((t) => t.quantity)) };
  });

  // Convert to DisplayTickets (adds status, deepLink, webFallback)
  const display = deduped.map(toDisplayTicket);

  // Sort: upcoming soonest-first, then past most-recent-first
  const byDateTime = (a: DisplayTicket, b: DisplayTicket) => {
    const dc = a.date.localeCompare(b.date);
    return dc !== 0 ? dc : timeToMins(a.time) - timeToMins(b.time);
  };
  const upcoming = display.filter((t) => t.status === 'upcoming').sort(byDateTime);
  const past = display.filter((t) => t.status === 'past').sort((a, b) => -byDateTime(a, b));

  return [...upcoming, ...past];
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [tickets, setTickets] = useState<DisplayTicket[]>(() => {
    const storedAccounts = loadAccounts();
    return storedAccounts.length > 0
      ? dedupAndSort(getAllCachedTickets(storedAccounts.map((a) => a.email)))
      : [];
  });

  // Handle OAuth callback: detect code synchronously, exchange asynchronously.
  // The code is an encrypted blob in ?code= that we POST to /api/auth/exchange
  // to get the actual tokens. Tokens never appear in the URL.
  const [authCode] = useState(() => detectAuthCode());

  useEffect(() => {
    if (!authCode) return;

    exchangeAuthCode(authCode).then((result) => {
      if (!result) return;

      const saved = loadAccounts();
      const idx = saved.findIndex((a) => a.email === result.email);
      let next: Account[];
      if (idx >= 0) {
        next = [...saved];
        next[idx] = { ...next[idx], sessionToken: result.sessionToken };
      } else {
        next = [...saved, result];
      }
      saveAccounts(next);
      setAccounts(next);
    });
  }, [authCode]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(ACTIVE_PLATFORMS);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('upcoming');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const stored = localStorage.getItem('tv_theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const isAuthenticated = accounts.length > 0;

  // Apply dark class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('tv_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const loadAllTickets = useCallback(async (accs: Account[]) => {
    setSyncing(true);
    setError(null);
    try {
      const results = await Promise.allSettled(accs.map((a) => fetchTicketsForAccount(a)));

      // Merge results from all accounts
      const merged: ParsedTicket[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          merged.push(...r.value);
        } else {
          console.warn(`Failed to fetch tickets for ${accs[i].email}:`, r.reason);
        }
      });

      setTickets(dedupAndSort(merged));
    } catch {
      setError('Could not load tickets. Try reconnecting.');
    } finally {
      setSyncing(false);
    }
  }, []);

  // Sync fresh data in the background whenever the account list changes
  useEffect(() => {
    if (accounts.length === 0) return;
    Promise.resolve().then(() => loadAllTickets(accounts));
  }, [accounts, loadAllTickets]);

  function handleConnect() { startGoogleAuth(); }
  function handleAddAccount() { startGoogleAuth(); }
  function handleSync() { if (accounts.length > 0) loadAllTickets(accounts); }
  function handleSignOut() {
    // Server revokes the Google grant and deletes the stored tokens.
    signOutAccounts(accounts).catch(() => {});
    clearAccounts();
    setAccounts([]);
    setTickets([]);
  }
  function togglePlatform(p: Platform) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header
        accounts={accounts}
        ticketCount={tickets.filter((t) => t.status === 'upcoming').length}
        onSync={handleSync}
        onSignOut={handleSignOut}
        onAddAccount={handleAddAccount}
        syncing={syncing}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
      />

      <main className="mx-auto max-w-6xl px-6 py-8">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        )}

        {!isAuthenticated ? (
          <ConnectGmail onConnect={handleConnect} />
        ) : (
          <>
            <div className="mb-6">
              <FilterBar
                selectedPlatforms={selectedPlatforms}
                onPlatformToggle={togglePlatform}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
              />
            </div>

            {syncing && tickets.length === 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <div className="h-6 w-24 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
                    <div className="h-5 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="flex flex-col gap-2">
                      <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                      <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                      <div className="h-4 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                    </div>
                    <div className="mt-auto flex items-center justify-between">
                      <div className="h-6 w-16 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
                      <div className="h-8 w-20 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-20 text-center text-gray-400 dark:text-gray-500">
                No tickets match your filters.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
