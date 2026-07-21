// ─── Platform ────────────────────────────────────────────────────────────────
// Mirrors src/types/index.ts in the web app (ticketvault repo) exactly.
export type Platform =
  | 'ticketmaster'
  | 'axs'
  | 'dice'
  | 'stubhub'
  | 'tickpick'
  | 'eventbrite'
  | 'seatgeek';

// ─── ParsedTicket — pure data from the server (Supabase-backed) ────────────
// No display state, no navigation URLs. Safe to cache because it never changes.
export interface ParsedTicket {
  id: string;
  platform: Platform;
  eventName: string;
  venue: string;
  city: string;
  date: string;            // YYYY-MM-DD
  time: string;            // "7:00 PM"
  section?: string;
  row?: string;
  seat?: string;
  quantity: number;
  orderNumber: string;
  confirmationEmailId: string;
  imageUrl?: string;
  barcode?: string;
}

// ─── DisplayTicket — client-side view model (computed at render time) ──────
// Extends ParsedTicket with display-only fields that depend on "now" or on
// client-side platform config. Never stored or cached.
export interface DisplayTicket extends ParsedTicket {
  status: 'upcoming' | 'past';
  deepLink: string;
  webFallback: string;
}

// ─── Backward-compat alias, same as the web app ─────────────────────────────
export type Ticket = DisplayTicket;
