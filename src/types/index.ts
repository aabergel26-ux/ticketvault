// ─── Platform ────────────────────────────────────────────────────────────────
export type Platform =
  | 'ticketmaster'
  | 'axs'
  | 'dice'
  | 'stubhub'
  | 'tickpick'
  | 'eventbrite'
  | 'seatgeek';
 
// ─── ParsedTicket — pure data from email parsing (server returns this) ──────
// Contains only facts extracted from the email. No display state, no navigation
// URLs. These are safe to cache because they never change.
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
  confirmationEmailId: string;  // Gmail message ID — enables incremental sync
  imageUrl?: string;
  barcode?: string;
}
 
// ─── DisplayTicket — client-side view model (computed at render time) ────────
// Extends ParsedTicket with display-only fields that depend on "now" or on
// client-side platform config. Never stored or cached.
 
export interface DisplayTicket extends ParsedTicket {
  status: 'upcoming' | 'past';
  deepLink: string;
  webFallback: string;
}
 
// ─── Backward compat alias ──────────────────────────────────────────────────
// Components that previously imported `Ticket` get `DisplayTicket` — the shape
// is a superset so everything still works.
export type Ticket = DisplayTicket;
 
// ─── Gmail types ─────────────────────────────────────────────────────────────
 
export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload?: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string };
    }>;
  };
}
 
export interface AuthState {
  isAuthenticated: boolean;
  userEmail: string | null;
  accessToken: string | null;
}