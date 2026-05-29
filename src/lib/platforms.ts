import type { Platform, Ticket } from '../types';

export interface PlatformConfig {
  id: Platform;
  label: string;
  badgeBg: string;       // Tailwind bg class for badge
  badgeText: string;     // Tailwind text class for badge
  accentColor: string;   // Tailwind text class for icons
  buttonBg: string;      // Tailwind bg class for CTA button
  buttonText: string;    // Tailwind text class for CTA button
  logo: string;
  senderDomains: string[];
  subjectPatterns: RegExp[];
  buildDeepLink: (ticket: Partial<Ticket>) => string;
  webBaseUrl: string;
}

export const PLATFORMS: Record<Platform, PlatformConfig> = {
  ticketmaster: {
    id: 'ticketmaster',
    label: 'Ticketmaster',
    badgeBg: 'bg-[#026CDF]',
    badgeText: 'text-white',
    accentColor: 'text-[#026CDF]',
    buttonBg: 'bg-[#026CDF]',
    buttonText: 'text-white',
    logo: '🎟',
    senderDomains: ['ticketmaster.com', 'livenation.com'],
    subjectPatterns: [/order confirmation/i, /your tickets/i],
    buildDeepLink: (t) => `tmol://mytickets/${t.orderNumber ?? ''}`,
    webBaseUrl: 'https://www.ticketmaster.com/user/orders',
  },
  axs: {
    id: 'axs',
    label: 'AXS',
    badgeBg: 'bg-[#E31837]',
    badgeText: 'text-white',
    accentColor: 'text-[#E31837]',
    buttonBg: 'bg-[#E31837]',
    buttonText: 'text-white',
    logo: '🎫',
    senderDomains: ['axs.com'],
    subjectPatterns: [/order confirmation/i, /ticket order/i],
    buildDeepLink: (t) => `axs://mytickets?order=${t.orderNumber ?? ''}`,
    webBaseUrl: 'https://www.axs.com/myaccount/tickets',
  },
  dice: {
    id: 'dice',
    label: 'DICE',
    badgeBg: 'bg-[#FFD600]',
    badgeText: 'text-black',
    accentColor: 'text-yellow-500',
    buttonBg: 'bg-[#FFD600]',
    buttonText: 'text-black',
    logo: '🎲',
    senderDomains: ['dice.fm'],
    subjectPatterns: [/your ticket/i, /order confirmed/i],
    buildDeepLink: (_t) => `dice://mytickets`,
    webBaseUrl: 'https://dice.fm/mytickets',
  },
  tickpick: {
    id: 'tickpick',
    label: 'TickPick',
    badgeBg: 'bg-purple-600',
    badgeText: 'text-white',
    accentColor: 'text-purple-400',
    buttonBg: 'bg-purple-600',
    buttonText: 'text-white',
    logo: '🎯',
    senderDomains: ['tickpick.com'],
    subjectPatterns: [/you purchased tickets/i],
    buildDeepLink: (_t) => `tickpick://mytickets`,
    webBaseUrl: 'https://www.tickpick.com/mytickets',
  },
  stubhub: {
    id: 'stubhub',
    label: 'StubHub',
    badgeBg: 'bg-[#770FDF]',
    badgeText: 'text-white',
    accentColor: 'text-[#770FDF]',
    buttonBg: 'bg-[#770FDF]',
    buttonText: 'text-white',
    logo: '🎪',
    senderDomains: ['stubhub.com'],
    subjectPatterns: [/order confirmation/i, /you're going/i],
    buildDeepLink: (t) => `stubhub://mytickets/${t.orderNumber ?? ''}`,
    webBaseUrl: 'https://www.stubhub.com/mytickets',
  },
  eventbrite: {
    id: 'eventbrite',
    label: 'Eventbrite',
    badgeBg: 'bg-orange-500',
    badgeText: 'text-white',
    accentColor: 'text-orange-400',
    buttonBg: 'bg-orange-500',
    buttonText: 'text-white',
    logo: '📅',
    senderDomains: ['eventbrite.com'],
    subjectPatterns: [/order confirmation/i, /ticket confirmation/i],
    buildDeepLink: (t) => `eventbrite://tickets/${t.orderNumber ?? ''}`,
    webBaseUrl: 'https://www.eventbrite.com/mytickets',
  },
  seatgeek: {
    id: 'seatgeek',
    label: 'SeatGeek',
    badgeBg: 'bg-teal-600',
    badgeText: 'text-white',
    accentColor: 'text-teal-400',
    buttonBg: 'bg-teal-600',
    buttonText: 'text-white',
    logo: '🪑',
    senderDomains: ['seatgeek.com'],
    subjectPatterns: [/order confirmation/i, /your order/i],
    buildDeepLink: (t) => `seatgeek://mytickets/${t.orderNumber ?? ''}`,
    webBaseUrl: 'https://seatgeek.com/account/tickets',
  },
};

export function openTicket(ticket: Ticket): void {
  const config = PLATFORMS[ticket.platform];
  const deepLink = config.buildDeepLink(ticket);
  const webUrl = ticket.webFallback || config.webBaseUrl;

  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);

  if (isMobile) {
    window.open(deepLink, '_blank');
  } else {
    window.open(webUrl, '_blank');
  }
}
