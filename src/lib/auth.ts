import type { ParsedTicket } from '../types';
import { TicketResponseSchema } from './validators';

// In production (Vercel), API routes are relative. In local dev, proxy to Express server.
const IS_DEV = import.meta.env.DEV;
const SERVER = IS_DEV ? (import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001') : '';

// ─── Storage keys ────────────────────────────────────────────────────────────
const ACCOUNTS_KEY = 'tv_accounts';
const CACHE_KEY = 'tv_ticket_cache';

// ─── Account model ───────────────────────────────────────────────────────────

export interface Account {
  email: string;
  sessionToken: string;  // opaque server-issued token; Google tokens never reach the client
  lastSyncAt?: string;   // ISO timestamp of last successful sync
}

// ─── Ticket cache ────────────────────────────────────────────────────────────
// Cached per-account so we can show tickets instantly on load and sync in
// the background. The cache stores ParsedTicket[] (pure data, no display state).

interface TicketCache {
  [email: string]: {
    tickets: ParsedTicket[];
    syncedAt: string;  // ISO timestamp
  };
}

export function loadTicketCache(): TicketCache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function getCachedTickets(email: string): ParsedTicket[] {
  const cache = loadTicketCache();
  return cache[email]?.tickets ?? [];
}

export function getAllCachedTickets(emails: string[]): ParsedTicket[] {
  const cache = loadTicketCache();
  return emails.flatMap((e) => cache[e]?.tickets ?? []);
}

export function saveCachedTickets(email: string, tickets: ParsedTicket[]) {
  const cache = loadTicketCache();
  cache[email] = { tickets, syncedAt: new Date().toISOString() };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full — clear old entries and retry
    localStorage.removeItem(CACHE_KEY);
    const fresh: TicketCache = { [email]: { tickets, syncedAt: new Date().toISOString() } };
    localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
  }
}

export function clearTicketCache() {
  localStorage.removeItem(CACHE_KEY);
}

// ─── OAuth initiation ────────────────────────────────────────────────────────

export function startGoogleAuth() {
  window.location.href = `${SERVER}/api/auth/google`;
}

// ─── OAuth callback — code exchange ──────────────────────────────────────────
// The callback URL now has ?code=ENCRYPTED_BLOB instead of tokens in the hash.
// detectAuthCode reads the code synchronously; exchangeAuthCode POSTs it to
// the server to get the actual tokens back. Tokens never appear in any URL.

export function detectAuthCode(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return null;

  // Clean up the URL immediately so the code doesn't linger
  history.replaceState(null, '', window.location.pathname);
  return code;
}

export async function exchangeAuthCode(code: string): Promise<Account | null> {
  try {
    const res = await fetch(`${SERVER}/api/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      session_token?: string;
      email?: string;
    };

    if (!data.session_token || !data.email) return null;

    return {
      sessionToken: data.session_token,
      email: data.email,
    };
  } catch {
    return null;
  }
}

// ─── Account persistence ────────────────────────────────────────────────────

export function loadAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Account[]).filter((a) => a.sessionToken && a.email);
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: Account[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function clearAccounts() {
  localStorage.removeItem(ACCOUNTS_KEY);
  clearTicketCache();
}

// ─── Sign out ────────────────────────────────────────────────────────────────
// The server holds the Google tokens now, so revocation happens server-side:
// it revokes the Google grant and deletes the user row (cascades to tickets).

export async function signOutAccounts(accounts: Account[]) {
  await Promise.allSettled(
    accounts.map((a) =>
      fetch(`${SERVER}/api/auth/signout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: a.sessionToken }),
      })
    )
  );
}

// ─── Fetch tickets with caching ──────────────────────────────────────────────
// No client-side token refresh — the server refreshes the Google access token
// against the value stored in Supabase and just returns the parsed tickets.

export async function fetchTicketsForAccount(account: Account): Promise<ParsedTicket[]> {
  const res = await fetch(`${SERVER}/api/tickets`, {
    headers: { Authorization: `Bearer ${account.sessionToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch tickets for ${account.email} (${res.status})`);
  }

  const raw = await res.json();
  const result = TicketResponseSchema.safeParse(raw);
  if (!result.success) {
    console.error(`Invalid ticket data for ${account.email}:`, result.error);
    return [];
  }
  const tickets = result.data;

  // Cache the fresh results
  saveCachedTickets(account.email, tickets);

  return tickets;
}