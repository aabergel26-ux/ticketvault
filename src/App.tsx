import { useState, useMemo, useEffect } from 'react';
import type { Platform, Ticket } from './types';
import { Header } from './components/Header';
import { ConnectGmail } from './components/ConnectGmail';
import { FilterBar } from './components/FilterBar';
import { TicketCard } from './components/TicketCard';
import {
  startGoogleAuth,
  parseAuthCallback,
  fetchTicketsForAccount,
  loadAccounts,
  saveAccounts,
  type Account,
} from './lib/auth';
import './index.css';

type StatusFilter = 'all' | 'upcoming' | 'past';

const ACTIVE_PLATFORMS: Platform[] = ['ticketmaster', 'axs', 'dice', 'stubhub'];

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [tickets, setTickets] = useState<Ticket[]>([]);
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
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('tv_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Handle OAuth callback
  useEffect(() => {
    const result = parseAuthCallback();
    if (result) {
      setAccounts((prev) => {
        const already = prev.some((a) => a.email === result.email);
        if (already) return prev;
        const next = [...prev, { accessToken: result.accessToken, email: result.email }];
        saveAccounts(next);
        return next;
      });
    }
  }, []);

  // Load tickets whenever accounts change
  useEffect(() => {
    if (accounts.length === 0) return;
    loadAllTickets(accounts);
  }, [accounts]);

  async function loadAllTickets(accs: Account[]) {
    setSyncing(true);
    setError(null);
    try {
      const results = await Promise.allSettled(accs.map((a) => fetchTicketsForAccount(a)));
      const merged: Ticket[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          merged.push(...r.value);
        } else {
          console.warn(`Failed to fetch tickets for ${accs[i].email}:`, r.reason);
        }
      });

      // Deduplicate across accounts AND platforms.
      // Reseller flow: you buy on StubHub, but the original vendor (DICE/AXS/TM)
      // transfers the actual tickets — same tickets arrive as two confirmations
      // (e.g. StubHub "Wakyin" + DICE "Wakyin & Guests"). Group by normalized
      // name + date, keep the original-vendor record, take MAX quantity.
      const PRIORITY: Record<string, number> = { dice: 5, axs: 4, ticketmaster: 3, tickpick: 2, stubhub: 1 };
      const normalizeName = (n: string) => n.toLowerCase()
        .replace(/\s*&\s*guests?\b/g, '')
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const groups = new Map<string, Ticket[]>();
      for (const t of merged) {
        const key = `${normalizeName(t.eventName)}|${t.date}`;
        const g = groups.get(key);
        if (g) g.push(t); else groups.set(key, [t]);
      }
      const deduped = Array.from(groups.values()).map((group) => {
        const rep = group.reduce(
          (best, t) => (PRIORITY[t.platform] ?? 0) > (PRIORITY[best.platform] ?? 0) ? t : best,
          group[0]
        );
        return { ...rep, quantity: Math.max(...group.map((t) => t.quantity)) };
      });

      // Re-sort after merge: upcoming soonest-first, then past most-recent-first.
      // Use same date-only string comparison as server. Tiebreak by time of day.
      const today = new Date().toISOString().split('T')[0];
      const timeToMins = (t: string) => {
        const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!m) return 720;
        let h = parseInt(m[1]); const min = parseInt(m[2]); const ap = m[3].toUpperCase();
        if (ap === 'PM' && h !== 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;
        return h * 60 + min;
      };
      const byDateTime = (a: Ticket, b: Ticket) => {
        const dc = a.date.localeCompare(b.date);
        return dc !== 0 ? dc : timeToMins(a.time) - timeToMins(b.time);
      };
      const upcoming = deduped.filter((t) => t.date >= today).sort(byDateTime);
      const past = deduped.filter((t) => t.date < today).sort((a, b) => -byDateTime(a, b));

      setTickets([...upcoming, ...past]);
    } catch {
      setError('Could not load tickets. Try reconnecting.');
    } finally {
      setSyncing(false);
    }
  }

  function handleConnect() { startGoogleAuth(); }
  function handleAddAccount() { startGoogleAuth(); }
  function handleSync() { if (accounts.length > 0) loadAllTickets(accounts); }
  function handleSignOut() {
    sessionStorage.removeItem('tv_accounts');
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
