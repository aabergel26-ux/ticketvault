export type Platform =
  | 'ticketmaster'
  | 'axs'
  | 'dice'
  | 'stubhub'
  | 'tickpick'
  | 'eventbrite'
  | 'seatgeek';

export interface Ticket {
  id: string;
  platform: Platform;
  eventName: string;
  venue: string;
  city: string;
  date: string; // ISO 8601
  time: string;
  section?: string;
  row?: string;
  seat?: string;
  quantity: number;
  orderNumber: string;
  confirmationEmailId: string; // Gmail message ID
  deepLink: string;
  webFallback: string;
  imageUrl?: string;
  barcode?: string;
  status: 'upcoming' | 'past' | 'cancelled';
}

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
