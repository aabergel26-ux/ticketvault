import { Linking } from 'react-native';
import type { Platform, ParsedTicket, DisplayTicket } from './types';

export interface PlatformConfig {
  id: Platform;
  label: string;
  color: string;       // brand color — badge background / accent
  textColor: string;    // badge text color (contrast against `color`)
  logo: string;
  buildDeepLink: (ticket: Pick<ParsedTicket, 'orderNumber'>) => string;
  webBaseUrl: string;
}

// Brand colors match the web app (src/lib/platforms.ts) and CLAUDE.md exactly.
export const PLATFORMS: Record<Platform, PlatformConfig> = {
  ticketmaster: {
    id: 'ticketmaster',
    label: 'Ticketmaster',
    color: '#026CDF',
    textColor: '#FFFFFF',
    logo: '🎟️',
    buildDeepLink: (t) => `tmol://mytickets/${t.orderNumber ?? ''}`,
    webBaseUrl: 'https://www.ticketmaster.com/user/orders',
  },
  axs: {
    id: 'axs',
    label: 'AXS',
    color: '#E31837',
    textColor: '#FFFFFF',
    logo: '🎫',
    buildDeepLink: (t) => `axs://mytickets?order=${t.orderNumber ?? ''}`,
    webBaseUrl: 'https://www.axs.com/myaccount/tickets',
  },
  dice: {
    id: 'dice',
    label: 'DICE',
    color: '#FFD600',
    textColor: '#000000',
    logo: '🎲',
    buildDeepLink: () => `dice://mytickets`,
    webBaseUrl: 'https://dice.fm/mytickets',
  },
  tickpick: {
    id: 'tickpick',
    label: 'TickPick',
    color: '#7C3AED',
    textColor: '#FFFFFF',
    logo: '🎯',
    buildDeepLink: () => `tickpick://mytickets`,
    webBaseUrl: 'https://www.tickpick.com/mytickets',
  },
  stubhub: {
    id: 'stubhub',
    label: 'StubHub',
    color: '#770FDF',
    textColor: '#FFFFFF',
    logo: '🎪',
    buildDeepLink: (t) => `stubhub://mytickets/${t.orderNumber ?? ''}`,
    webBaseUrl: 'https://www.stubhub.com/mytickets',
  },
  eventbrite: {
    id: 'eventbrite',
    label: 'Eventbrite',
    color: '#F05537',
    textColor: '#FFFFFF',
    logo: '📅',
    buildDeepLink: (t) => `eventbrite://tickets/${t.orderNumber ?? ''}`,
    webBaseUrl: 'https://www.eventbrite.com/mytickets',
  },
  seatgeek: {
    id: 'seatgeek',
    label: 'SeatGeek',
    color: '#0D9488',
    textColor: '#FFFFFF',
    logo: '🪑',
    buildDeepLink: (t) => `seatgeek://mytickets/${t.orderNumber ?? ''}`,
    webBaseUrl: 'https://seatgeek.com/account/tickets',
  },
};

// ─── Convert server ParsedTicket → client DisplayTicket ─────────────────────
// Pure function of the parsed data + today's date + platform config. Called
// at render time so status is always fresh. Never cached. Mirrors the web
// app's toDisplayTicket() in src/lib/platforms.ts exactly.
export function toDisplayTicket(parsed: ParsedTicket): DisplayTicket {
  const today = new Date().toISOString().split('T')[0];
  const config = PLATFORMS[parsed.platform];
  return {
    ...parsed,
    status: parsed.date >= today ? 'upcoming' : 'past',
    deepLink: config.buildDeepLink(parsed),
    webFallback: config.webBaseUrl,
  };
}

// ─── Open ticket in native app, falling back to web ─────────────────────────
// Linking.openURL rejects if no app is registered for the scheme (or the user
// declined), which is our signal to fall back to the web URL.
export async function openTicket(ticket: DisplayTicket): Promise<void> {
  const config = PLATFORMS[ticket.platform];
  const webUrl = ticket.webFallback || config.webBaseUrl;
  try {
    await Linking.openURL(ticket.deepLink);
  } catch {
    await Linking.openURL(webUrl);
  }
}

// ─── Map link for the venue (used on TicketDetailScreen) ───────────────────
export function buildMapUrl(venue: string, city: string): string {
  const query = encodeURIComponent(`${venue}, ${city}`);
  return `https://maps.apple.com/?q=${query}`;
}
