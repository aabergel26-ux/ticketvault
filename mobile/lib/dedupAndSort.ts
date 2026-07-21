import type { ParsedTicket, DisplayTicket } from './types';
import { toDisplayTicket } from './platforms';

// Mirrors the dedup + sort logic in the web app's src/App.tsx exactly.

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

export function dedupAndSort(tickets: ParsedTicket[]): DisplayTicket[] {
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
