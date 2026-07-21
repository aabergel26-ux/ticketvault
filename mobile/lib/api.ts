import { z } from 'zod';
import type { ParsedTicket } from './types';

export const API_BASE_URL = 'https://ticketvault-eight.vercel.app';

const ParsedTicketSchema = z.object({
  id: z.string(),
  platform: z.enum([
    'ticketmaster', 'axs', 'dice', 'stubhub',
    'tickpick', 'eventbrite', 'seatgeek',
  ]),
  eventName: z.string(),
  venue: z.string(),
  city: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string(),
  quantity: z.number().int().positive(),
  orderNumber: z.string(),
  confirmationEmailId: z.string(),
  section: z.string().optional(),
  row: z.string().optional(),
  seat: z.string().optional(),
  imageUrl: z.string().optional(),
  barcode: z.string().optional(),
});

// Same shape as src/lib/validators.ts (TicketResponseSchema) in the web app —
// both /api/tickets and /api/sync return { tickets, syncing }.
const TicketResponseSchema = z.object({
  tickets: z.array(ParsedTicketSchema),
  syncing: z.boolean(),
});

export class ReconnectRequiredError extends Error {
  constructor() {
    super('Session expired or invalid — please reconnect Gmail.');
  }
}

async function fetchTicketResponse(
  path: '/api/tickets' | '/api/sync',
  sessionToken: string
): Promise<{ tickets: ParsedTicket[]; syncing: boolean }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });

  if (res.status === 401) throw new ReconnectRequiredError();
  if (!res.ok) throw new Error(`Request to ${path} failed (${res.status})`);

  const raw = await res.json();
  const result = TicketResponseSchema.safeParse(raw);
  if (!result.success) {
    console.error(`Invalid ticket response from ${path}:`, result.error);
    return { tickets: [], syncing: false };
  }
  return result.data;
}

// Two-step flow, same as the web app's fetchTicketsForAccount:
// /api/tickets returns instantly from Supabase and reports whether the
// cache is stale via `syncing`. If it is, /api/sync is called next — it can
// take the full 30s since it's the one hitting Gmail. `onCachedTickets` lets
// the caller render the fast response immediately.
export async function fetchTickets(
  sessionToken: string,
  onCachedTickets?: (tickets: ParsedTicket[]) => void
): Promise<ParsedTicket[]> {
  const cached = await fetchTicketResponse('/api/tickets', sessionToken);
  onCachedTickets?.(cached.tickets);

  if (!cached.syncing) return cached.tickets;

  const fresh = await fetchTicketResponse('/api/sync', sessionToken);
  return fresh.tickets;
}

// Bypasses the /api/tickets freshness check and calls /api/sync directly —
// used for pull-to-refresh, where the user explicitly wants a real Gmail sync
// regardless of how recently the last one ran.
export async function syncTickets(sessionToken: string): Promise<ParsedTicket[]> {
  const fresh = await fetchTicketResponse('/api/sync', sessionToken);
  return fresh.tickets;
}

export async function signOut(sessionToken: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/auth/signout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_token: sessionToken }),
  }).catch(() => {
    // Best-effort — SecureStore is cleared client-side regardless.
  });
}
