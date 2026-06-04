import type { Ticket, Platform } from '../src/types/index.js';

const PLATFORM_SENDERS: Record<Platform, string[]> = {
  ticketmaster: ['ticketmaster.com', 'livenation.com'],
  axs: ['axs.com'],
  dice: ['dice.fm'],
  stubhub: ['stubhub.com'],
  tickpick: ['tickpick.com'],
  eventbrite: [],
  seatgeek: [],
};

const PLATFORM_DEEP_LINKS: Record<Platform, (order: string) => string> = {
  ticketmaster: (o) => `tmol://mytickets/${o}`,
  axs: (_o) => `axs://mytickets`,
  dice: (_o) => `dice://mytickets`,
  stubhub: (o) => `stubhub://mytickets/${o}`,
  tickpick: (_o) => `tickpick://mytickets`,
  eventbrite: (o) => `eventbrite://tickets/${o}`,
  seatgeek: (o) => `seatgeek://mytickets/${o}`,
};

const PLATFORM_WEB_URLS: Record<Platform, string> = {
  ticketmaster: 'https://www.ticketmaster.com/user/orders',
  axs: 'https://www.axs.com/myaccount/tickets',
  dice: 'https://dice.fm/mytickets',
  stubhub: 'https://www.stubhub.com/mytickets',
  tickpick: 'https://www.tickpick.com/mytickets',
  eventbrite: 'https://www.eventbrite.com/mytickets',
  seatgeek: 'https://seatgeek.com/account/tickets',
};

interface GmailMessage {
  id: string;
  payload?: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType: string; body?: { data?: string }; parts?: unknown[] }>;
  };
}

function detectPlatform(from: string): Platform | null {
  const lower = from.toLowerCase();
  for (const [platform, domains] of Object.entries(PLATFORM_SENDERS)) {
    if (domains.length && domains.some((d) => lower.includes(d))) return platform as Platform;
  }
  return null;
}

function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

type EmailPart = { mimeType: string; body?: { data?: string }; parts?: EmailPart[] };

function extractBody(payload: GmailMessage['payload']): string {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64(payload.body.data);

  function findHtml(parts: EmailPart[]): string {
    let plainFallback = '';
    for (const part of parts) {
      if (part.mimeType === 'text/html' && part.body?.data) return decodeBase64(part.body.data);
      if (part.mimeType === 'text/plain' && part.body?.data) plainFallback = decodeBase64(part.body.data);
      if (part.parts?.length) {
        const nested = findHtml(part.parts);
        if (nested) return nested;
      }
    }
    return plainFallback;
  }

  return findHtml((payload.parts ?? []) as EmailPart[]);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&middot;/gi, '·')
    .replace(/&bull;/gi, '•')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function makeTicket(partial: Omit<Ticket, 'status' | 'deepLink' | 'webFallback'> & { platform: Platform }): Ticket {
  // Use date-only comparison (YYYY-MM-DD string) to avoid server timezone drift
  const today = new Date().toISOString().split('T')[0];
  const isUpcoming = partial.date >= today;
  return {
    ...partial,
    status: isUpcoming ? 'upcoming' : 'past',
    deepLink: PLATFORM_DEEP_LINKS[partial.platform](partial.orderNumber),
    webFallback: PLATFORM_WEB_URLS[partial.platform],
  };
}

function timeToMinutes(time: string): number {
  const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return 1200; // default noon
  let hours = parseInt(match[1]);
  const mins = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return hours * 60 + mins;
}

// ─── DICE ─────────────────────────────────────────────────────────────────────
// Keep: "Your tickets are sorted for X" (EN) / "Tes billets pour X" (FR)
// Keep: "X sent you N ticket(s)" (transfer received)
// Keep: "Get ready for X" / "Prépare-toi pour X" (day-of — has venue+date even if duplicate)
// Skip: login codes, reviews, marketing, transfer-sent, presale alerts

const DICE_SKIP = [
  /code de connexion/i,
  /verify your account/i,
  /alors.*comment/i,
  /c'était comment/i,
  /billet envoyé à/i,
  /ticket sent to/i,
  /presale alert/i,
  /on sale today/i,
  /you're invited/i,
  /upcoming shows/i,
  /^reminder/i,
  /only \d+ days/i,
  /pool party/i,
  /boat party/i,
  /liste d'attente/i,      // waitlist — not a confirmed ticket
  /prends ta place/i,      // waitlist conversion prompt
  /validation reminder/i,
  /venue update/i,
  /rescheduled/i,
  /demande d'abonnement/i,
  /tu suis /i,
  /qu'as-tu pens/i,        // post-event review
  /aujourd'hui [àa]/i,     // day-of reminder
  /today at \d/i,          // day-of reminder
];

// Track refunded DICE events to exclude them
const DICE_REFUND = /^Remboursement\s*:|^Refund\s*:/i;

const FRENCH_MONTHS: Record<string, number> = {
  jan: 1, janv: 1, janvier: 1,
  fev: 2, fév: 2, février: 2,
  mars: 3,
  avr: 4, avril: 4,
  mai: 5,
  juin: 6,
  juil: 7, juillet: 7,
  aout: 8, août: 8,
  sept: 9, septembre: 9,
  oct: 10, octobre: 10,
  nov: 11, novembre: 11,
  dec: 12, déc: 12, décembre: 12,
};

// parseDiceDate accepts an optional emailYear — used as fallback when no year appears in the body
function parseDiceDate(text: string, emailYear?: number): { date: string; time: string } {
  const fallbackYear = emailYear ?? new Date().getFullYear();
  const EN_MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  // ── English: "Sat 01 Jul, 7:00 PM" or "Sat 01 Jul 2023, 7:00 PM" (DAY MONTH or DAY YEAR MONTH handled below)
  const enStd = text.match(/(?:Date\s*[&et]\s*(?:time|heure)\s+)?(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\.?\s+(\d{1,2})\s+([A-Za-z]+),?\s*(\d{4})?\s*,?\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  if (enStd) {
    const day = parseInt(enStd[1]);
    const monthStr = enStd[2].toLowerCase().slice(0, 3);
    const month = EN_MONTHS[monthStr];
    const year = enStd[3] ? parseInt(enStd[3]) : fallbackYear;
    if (month) return {
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      time: enStd[4] ?? '8:00 PM',
    };
  }

  // ── English: "Sat 29 2023 Jul, 10:00 PM" — DICE quirk where year appears between day and month
  const enYearMid = text.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\.?\s+(\d{1,2})\s+(\d{4})\s+([A-Za-z]+),?\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  if (enYearMid) {
    const day = parseInt(enYearMid[1]);
    const year = parseInt(enYearMid[2]);
    const monthStr = enYearMid[3].toLowerCase().slice(0, 3);
    const month = EN_MONTHS[monthStr];
    if (month) return {
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      time: enYearMid[4] ?? '8:00 PM',
    };
  }

  const FR_MONTH_PAT = 'jan(?:v|ier)?\.?|f[ée]v(?:rier)?\.?|mars|avr(?:il)?\.?|mai|juin|juil(?:let)?\.?|ao[uû]t|sept(?:embre)?\.?|oct(?:obre)?\.?|nov(?:embre)?\.?|d[eé]c(?:embre)?\.?';
  const resolveFrMonth = (raw: string) => {
    const key = raw.toLowerCase().replace(/\.$/, '').replace(/[éè]/g, 'e').replace(/[û]/g, 'u');
    for (const [k, v] of Object.entries(FRENCH_MONTHS)) {
      if (key.startsWith(k.replace(/[éè]/g, 'e').replace(/[û]/g, 'u'))) return v;
    }
    return 0;
  };

  // ── French standard: "sam. 09 mai, 10:00 PM" or "sam. 09 mai, 2026"
  const frStd = text.match(new RegExp(`(?:lun|mar|mer|jeu|ven|sam|dim)\\.?\\s+(\\d{1,2})\\s+(${FR_MONTH_PAT}),?\\s*(?:(\\d{4})|(\\d{1,2}:\\d{2}\\s*(?:AM|PM)?))`, 'i'));
  if (frStd) {
    const day = parseInt(frStd[1]);
    const month = resolveFrMonth(frStd[2]);
    const year = frStd[3] ? parseInt(frStd[3]) : fallbackYear;
    if (month) return {
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      time: frStd[4] ?? '8:00 PM',
    };
  }

  // ── French year-mid: "sam. 30 2024 mars, 10:00 PM" — DICE quirk
  const frYearMid = text.match(new RegExp(`(?:lun|mar|mer|jeu|ven|sam|dim)\\.?\\s+(\\d{1,2})\\s+(\\d{4})\\s+(${FR_MONTH_PAT}),?\\s*(\\d{1,2}:\\d{2}\\s*(?:AM|PM)?)`, 'i'));
  if (frYearMid) {
    const day = parseInt(frYearMid[1]);
    const year = parseInt(frYearMid[2]);
    const month = resolveFrMonth(frYearMid[3]);
    if (month) return {
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      time: frYearMid[4] ?? '8:00 PM',
    };
  }

  // ── "Date jeudi 14 mai, 2026" or "Date samedi 9 - dimanche 10, mai 2026"
  const frFull = text.match(new RegExp(`Date\\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\\s+(\\d{1,2})(?:\\s+-\\s+\\w+\\s+\\d{1,2})?,\\s*(${FR_MONTH_PAT})\\s+(\\d{4})`, 'i'));
  if (frFull) {
    const day = parseInt(frFull[1]);
    const month = resolveFrMonth(frFull[2]);
    const year = parseInt(frFull[3]);
    if (month) return {
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      time: '8:00 PM',
    };
  }

  return { date: `${fallbackYear}-01-01`, time: '8:00 PM' };
}

function parseDiceTicket(msg: GmailMessage): Ticket | null {
  const headers = msg.payload?.headers ?? [];
  const get = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? '';
  const subject = get('Subject').trim();

  if (DICE_SKIP.some((r) => r.test(subject))) return null;

  // "Your tickets: EVENT" / "Tes billets : EVENT" is DICE's older delivery format
  const isPurchase = /^(Tes billets pour|Your tickets are sorted for|Your tickets:|Tes billets\s*:)/i.test(subject);
  // Transfer RECEIVED — EN: "X sent you tickets" / FR: "X t'a envoyé des/tes billets"
  // (note: "Billet envoyé à Y" = transfer SENT — excluded via DICE_SKIP)
  const isTransfer = /sent you .* ticket|t['’]a envoy[ée] (?:des|tes) billets/i.test(subject);
  const isDayOf = /^(Get ready for|Prépare-toi pour|Aujourd'hui|Today at)/i.test(subject);

  if (!isPurchase && !isTransfer && !isDayOf) return null;

  const body = extractBody(msg.payload);
  const text = stripHtml(body);

  // Event name — EN: "Your tickets are sorted for EVENT" / FR: in body "== EVENT =="
  let eventName = '';
  const enSubjectMatch = subject.match(/Your tickets are sorted for\s+(.+)/i);
  const frSubjectMatch = subject.match(/^Tes billets pour\s+(.+)/i);
  const enColonMatch = subject.match(/^Your tickets:\s+(.+)/i);
  const frColonMatch = subject.match(/^Tes billets\s*:\s+(.+)/i);
  const dayOfEnMatch = subject.match(/^Get ready for\s+(.+)/i);
  const dayOfFrMatch = subject.match(/^(?:Prépare-toi pour|Aujourd'hui [àa] \d+:\d+ :\s*)(.+)/i);
  const transferMatch = subject.match(/sent you .* tickets? for\s+(.+)/i);
  // Transfer event name lives in the BODY: FR "Tu as maintenant des billets pour EVENT"
  // / EN "You now have tickets for EVENT"
  const transferBodyMatch = text.match(/(?:Tu as maintenant des billets pour|You now have tickets for|C'est dans la poche pour|Your tickets are sorted for)\s+([^.!\n]{3,80}?)\s*[.!]/i);
  const bodyEventMatch = text.match(/(?:C'est dans la poche[^=]+==[^=]*==\s*|Purchase confirmation[^=]+==[^=]*==\s*)([^=]{3,80}?)\s*(?:==|Voir tes billets|View your tickets)/i);

  eventName = (enSubjectMatch?.[1] ?? frSubjectMatch?.[1] ?? enColonMatch?.[1] ?? frColonMatch?.[1] ?? dayOfEnMatch?.[1] ?? dayOfFrMatch?.[1] ?? transferMatch?.[1] ?? transferBodyMatch?.[1] ?? bodyEventMatch?.[1] ?? '').trim();
  if (!eventName) return null;

  // Venue — EN: "Venue NAME 123 Street" / FR: "Salle NAME 123 rue"
  // Capture everything after "Venue"/"Salle" up to the first street number
  // Capture venue name ending on a non-space char so trailing whitespace doesn't break the lookahead
  const enVenueMatch = text.match(/\bVenue\s+([A-Za-z][^0-9\n]{2,79}[A-Za-z0-9])(?=\s+\d|\s*,\s*\d{5}|\s{3,}|$)/i);
  const frVenueMatch = text.match(/\bSalle\s+([A-Za-z][^0-9\n]{2,79}[A-Za-z0-9])(?=\s+\d|\s*,\s*\d{5}|\s{3,}|$)/i);
  const rawVenue = (enVenueMatch?.[1] ?? frVenueMatch?.[1] ?? '').trim().replace(/\s+/g, ' ').replace(/^Salle\s+/i, '');
  // Reject city-only patterns, URLs, or junk text
  const isCityOnly = /^[A-Za-z\s]+,\s*[A-Z]{2}$/.test(rawVenue);
  const isJunk = /https?:|bit\.ly|requirements|click here/i.test(rawVenue);
  const venue = (!isCityOnly && !isJunk && rawVenue) ? rawVenue : 'Venue TBD';

  // City — "Brooklyn, NY" or "Los Angeles, CA"
  const cityMatch = text.match(/([A-Za-z][A-Za-z\s]{2,25}),\s*(New York|NY|CA|IL|FL|TX|NJ|MA|WA|[A-Z]{2})\s+\d{5}/);
  const city = cityMatch ? `${cityMatch[1].trim()}, ${cityMatch[2]}` : '';

  // Use email received year as fallback for when DICE omits the year in the body
  const emailDateHeader = get('Date');
  const emailYear = emailDateHeader ? new Date(emailDateHeader).getFullYear() : undefined;

  // Date & time
  const { date, time } = parseDiceDate(text, emailYear);

  // Quantity — EN: "Quantity 2" / FR: "Billets 2 ×" or "Quantité 1"
  const qtyMatch = text.match(/(?:Quantity|Billets|Quantit[eé])\s+(\d+)\s*[×x]?/i);
  const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;

  return makeTicket({
    id: msg.id,
    platform: 'dice',
    eventName,
    venue,
    city,
    date,
    time,
    quantity,
    orderNumber: msg.id,
    confirmationEmailId: msg.id,
  });
}

// ─── AXS ──────────────────────────────────────────────────────────────────────
// Keep: "Thank you for your order for X" (purchase confirmation)
// Keep: "Tickets Just Got Sent To You" / "YOUR TICKETS ARE HERE" (delivery — has event details)
// Skip everything else

const AXS_SKIP = [
  /presale/i,
  /on sale/i,
  /reminder/i,
  /newsletter/i,
  /verify/i,
  /reset password/i,
  /password reset/i,
  /phone number updated/i,
  /ready to transfer/i,
  /your account has been/i,
  // Note: "delivered to your account" removed — some purchase confirmations use this phrase
  // Instead we rely on rawName being null to skip emails with no event details
];

function parseAxsTicket(msg: GmailMessage): Ticket | null {
  const headers = msg.payload?.headers ?? [];
  const get = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? '';
  const subject = get('Subject').trim();

  // Order confirmations always proceed even if they match a skip pattern (e.g. Amex Presale purchases)
  const isOrderConfirmation = /thank you for your order|order details for/i.test(subject);
  if (!isOrderConfirmation && AXS_SKIP.some((r) => r.test(subject))) return null;
  if (!isOrderConfirmation && !/order|ticket/i.test(subject)) return null;

  const body = extractBody(msg.payload);
  const text = stripHtml(body);

  // Event name — try multiple patterns in priority order
  // 1. Order confirmation body: "Order details for EVENT at VENUE"
  const orderDetailsMatch = text.match(/Order details for\s+(.+?)\s+at\s+/i);
  // 2. Thank you subject: "Thank you for your order for EVENT"
  const thankYouMatch = text.match(/Thank you for your order for\s+(.+?)(?:\s+Quantity|\s+\d+\s+ticket|\n)/i);
  // 3. Transfer body: "NAME transferred N tickets to you for EVENT at VENUE"
  const transferMatch = text.match(/transferred\s+\d+\s+tickets?\s+to you for\s+(.+?)\s+at\s+/i);

  const rawName = (orderDetailsMatch?.[1] ?? thankYouMatch?.[1] ?? transferMatch?.[1])?.trim();
  if (!rawName) return null; // no event details found — skip email (e.g. "YOUR TICKETS ARE HERE" delivery notice)
  let eventName = rawName
    .replace(/\s*[-–]\s*Amex Presale Tickets?[™®]?/i, '')
    .replace(/\s*[-–]\s*Artist Presale/i, '')
    .replace(/\s*[-–]\s*Presale Tickets?[™®]?/i, '')
    .trim();

  // Venue extraction:
  // Order format: "Order details for EVENT at VENUE scheduled on"
  // Transfer format: "for EVENT at VENUE, City, State on DAY"
  // Also: "Thank you for your order for EVENT at VENUE on DATE"
  const venueFromOrder = text.match(/Order details for .+?\s+at\s+(.+?)\s+scheduled on/i);
  const venueFromTransfer = text.match(/transferred \d+ tickets? to you for .+? at\s+([^,\n]{4,80}?)(?:,\s*[A-Z]|$)/i);
  const venueFromThankYou = text.match(/Thank you for your order for .+?\s+at\s+(.+?)\s+(?:on|scheduled)/i);
  const venue = (venueFromOrder?.[1] ?? venueFromThankYou?.[1] ?? venueFromTransfer?.[1])?.trim() || 'Venue TBD';

  // City — from billing address or transfer line "VENUE, City, ST on"
  const cityFromTransfer = text.match(/transferred \d+ tickets? to you for .+? at [^,\n]+,\s*([^,\n]+),\s*([A-Z]{2})\s+on/i);
  const cityFromAddress = text.match(/([A-Za-z][A-Za-z\s]{2,20}),\s*([A-Z]{2})[-\s]+\d{5}/);
  const city = cityFromTransfer
    ? `${cityFromTransfer[1].trim()}, ${cityFromTransfer[2]}`
    : cityFromAddress ? `${cityFromAddress[1].trim()}, ${cityFromAddress[2]}` : '';

  // Confirmation number
  const orderMatch = text.match(/confirmation number is\s+(\d+)/i)
    ?? text.match(/Order\s*#\s*([\d\-]+)/i)
    ?? text.match(/confirmation\s+(?:number|code)\s*:?\s*([\d\-]{4,})/i);
  const orderNumber = orderMatch?.[1] ?? '';

  // Date: "scheduled on 6/6/2026 7:00 PM" or "Saturday 11-25-23 at 7:30 pm"
  const schedMatch = text.match(/scheduled on\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
  const altDateMatch = text.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+(\d{1,2}-\d{1,2}-\d{2,4})\s+at\s+(\d{1,2}:\d{2}\s*[ap]m)/i);
  // Use email received date as fallback so old tickets don't default to today's year
  const emailDateHeader = get('Date');
  const emailReceivedDate = emailDateHeader ? new Date(emailDateHeader) : null;
  const fallbackDate = (emailReceivedDate && !isNaN(emailReceivedDate.getTime()))
    ? emailReceivedDate.toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  let date = fallbackDate;
  let time = '8:00 PM';
  if (schedMatch) {
    const d = new Date(schedMatch[1]);
    if (!isNaN(d.getTime())) date = d.toISOString().split('T')[0];
    time = schedMatch[2];
  } else if (altDateMatch) {
    // Parse explicitly to handle 2-digit years correctly (e.g. "12-21-22" → 2022)
    const parts = altDateMatch[1].split('-');
    const month = parseInt(parts[0]);
    const day = parseInt(parts[1]);
    let year = parseInt(parts[2]);
    if (year < 100) year += year < 70 ? 2000 : 1900; // 22 → 2022, 85 → 1985
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) date = d.toISOString().split('T')[0];
    time = altDateMatch[2];
  }

  // Quantity
  const qtyMatch = text.match(/Quantity[^\d]*(\d+)/i);
  const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;

  // Section/Row/Seat — AXS table format: "Quantity Section Row Seat(s) [qty] [section] [row] [seat]"
  // The table headers appear before the values; parse values by matching the sequence after headers.
  const tableMatch = text.match(/Quantity\s+Section\s+Row\s+Seats?\s+\d+\s+([A-Za-z][A-Za-z0-9 ]*?)\s+(N\/A|[A-Za-z0-9]+)\s+(\d+)/i);
  const sectionVal = tableMatch?.[1]?.trim();
  const rowValRaw = tableMatch?.[2]?.trim();
  const seatVal = tableMatch?.[3]?.trim();
  // Fallback for non-table formats
  const sectionFallback = text.match(/Section\s*:\s*([A-Za-z0-9][A-Za-z0-9 ]*?)(?:\s+Row|\s*$)/i)?.[1]?.trim();
  const rowFallbackRaw = text.match(/Row\s*:\s*([A-Za-z0-9\/]+)/i)?.[1]?.trim();
  const sectionMatch = sectionVal ? [null, sectionVal] : sectionFallback ? [null, sectionFallback] : null;
  const rowMatchVal = (rowValRaw && rowValRaw.toUpperCase() !== 'N/A') ? rowValRaw : (rowFallbackRaw && rowFallbackRaw.toUpperCase() !== 'N/A') ? rowFallbackRaw : null;
  const seatMatch = seatVal ? [null, seatVal] : text.match(/Seat\s*:\s*([A-Za-z0-9]+)/i);

  return makeTicket({
    id: msg.id,
    platform: 'axs',
    eventName,
    venue,
    city,
    date,
    time,
    quantity,
    orderNumber,
    confirmationEmailId: msg.id,
    section: sectionMatch?.[1],
    row: rowMatchVal ?? undefined,
    seat: seatMatch?.[1],
  });
}

// ─── Ticketmaster ─────────────────────────────────────────────────────────────
// Keep: "You Got Tickets To X"
// Keep: "Your EVENT Ticket Order XXXX" when body says "Your Tickets Are Ready"
// Skip: presale, on-sale, "order is being processed", newsletters

const TM_SKIP = [
  /presale/i,
  /on sale/i,
  /reminder/i,
  /your order is being processed/i,
  /newsletter/i,
  /fan club/i,
  /updating our terms/i,
  /\$\d+ tickets/i,    // "$30 Tickets – Ends Today!" promos
  /upcoming concert lineup/i,
];

function parseTicketmasterTicket(msg: GmailMessage): Ticket | null {
  const headers = msg.payload?.headers ?? [];
  const get = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? '';
  const subject = get('Subject').trim();

  if (TM_SKIP.some((r) => r.test(subject))) return null;

  const isClassic = /you got tickets?/i.test(subject);
  // Resale format: "Your EVENT Ticket Order XXXX" — only valid if body says "Tickets Are Ready"
  const isResaleOrder = /ticket order\s+[\d\-]+/i.test(subject);
  if (!isClassic && !isResaleOrder) return null;

  const body = extractBody(msg.payload);
  const text = stripHtml(body);

  // Resale "order is being processed" — skip, wait for the "Tickets Are Ready" email
  if (isResaleOrder && /order is being processed/i.test(text)) return null;
  // Resale must say "Tickets Are Ready" or "Tickets Available"
  if (isResaleOrder && !/tickets are ready|tickets available/i.test(text)) return null;

  // ── Event name ──
  // Classic: "You Got Tickets To EVENT NAME" in subject
  const classicMatch = subject.match(/You Got Tickets To\s+(.+)/i);
  // Resale: "Your EVENT Ticket Order XXXX" — extract event before "Ticket Order"
  const resaleMatch = subject.match(/^Your\s+(.+?)\s+Ticket Order\s+[\d\-]/i);
  let eventName = (classicMatch?.[1] ?? resaleMatch?.[1])?.trim();
  if (!eventName) return null;
  // Strip Ticketmaster's age/ID qualifiers: "- 18 Years and Older with Valid ID to Enter",
  // "- All Ages", "- 21 & Over", "- 18+", etc.
  eventName = eventName
    .replace(/\s*[-–]\s*\d+\s*(?:\+|&\s*(?:over|up)|years?\s+and\s+older).*$/i, '')
    .replace(/\s*[-–]\s*all ages.*$/i, '')
    .trim();

  // ── Venue & city ──
  // Format 1: "VENUE — City, State" (em dash or en dash)
  // Must start with a letter to avoid capturing time fragments like "00 PM Red Bull Arena"
  const dashVenue = text.match(/([A-Za-z][A-Za-z0-9\s'&().,-]{3,60}?)\s*[—–]\s*([A-Za-z][A-Za-z\s,]{5,60}?)(?=\s+(?:Get|View|Download|Important|$)|\s*\d)/);
  // Format 2: "at VENUE\nCity, State" — venue on its own line before city
  const atVenue = text.match(/\bat\s+([A-Za-z][A-Za-z0-9\s'&().,-]{3,60}?)(?=\s+(?:Harrison|Los Angeles|Brooklyn|New York|Maspeth|[A-Z][a-z]+,\s*[A-Z]{2}))/i);
  const venueRaw = (dashVenue?.[1] ?? atVenue?.[1])?.trim() ?? '';
  const venue = venueRaw.replace(/^(?:AM|PM)\s+/i, '') || 'Venue TBD';
  // Trim city to "City, State" — drop any trailing words like "Get Directions"
  const rawCity = dashVenue?.[2]?.trim() ?? '';
  const city = rawCity.match(/^([A-Za-z][A-Za-z\s]{2,25},\s*[A-Za-z][A-Za-z\s]{2,25})/)?.[1]?.trim() ?? rawCity;

  // ── Date ──
  // Use email received date's year as fallback — prevents defaulting to current year
  const tmEmailDate = get('Date');
  const tmEmailYear = tmEmailDate ? new Date(tmEmailDate).getFullYear() : new Date().getFullYear();

  // Primary: "Month DD, YYYY" anywhere in text — year is always explicit, most reliable
  const broadDate = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s*(\d{4})\b/i);
  // Resale fallback: "Wed, Dec 21 @ 7:30 PM" — no year, use email received year
  const resaleDate = text.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s*(\w+)\s+(\d{1,2}),?\s*(\d{4})?\s*[@·•]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);

  let date = new Date().toISOString().split('T')[0];
  let time = '8:00 PM';

  if (broadDate) {
    // Has explicit year — most reliable
    const d = new Date(`${broadDate[1]} ${broadDate[2]}, ${broadDate[3]}`);
    if (!isNaN(d.getTime())) date = d.toISOString().split('T')[0];
    const timeNearby = text.match(/\b(\d{1,2}:\d{2}\s*[AP]M)\b/i);
    if (timeNearby) time = timeNearby[1];
  } else if (resaleDate) {
    // No year in email body — use year from email received date
    const yr = resaleDate[3] ? parseInt(resaleDate[3]) : tmEmailYear;
    const d = new Date(`${resaleDate[1]} ${resaleDate[2]}, ${yr}`);
    if (!isNaN(d.getTime())) date = d.toISOString().split('T')[0];
    time = resaleDate[4];
  }

  // ── Order number ──
  // "Order # 74-21547/NY1" or "Order #: 2900-0493-8281-5878-9"
  // Require # or explicit keyword to avoid matching standalone years like "2022"
  const orderMatch = text.match(/Order\s*[#:]\s*([\d\-\/A-Z]{5,})/i)
    ?? text.match(/Order\s+(?:No\.?|Number)\s*:?\s*([\d\-\/A-Z]{5,})/i)
    ?? subject.match(/Ticket Order\s+([\d\-]+)/i)
    ?? text.match(/confirmation\s+(?:number|#|code)\s*:?\s*([\d\-A-Z]{5,})/i);
  const orderNumber = orderMatch?.[1]?.trim() ?? '';

  // ── Quantity & seat info ──
  const qtyMatch = text.match(/(\d+)\s+(?:General Admission|GA|tickets?\b)/i);
  const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;

  // Section/Row/Seat
  const sectionMatch = text.match(/Section\s+([A-Za-z0-9]+)/i);
  const rowMatch = text.match(/Row\s+([A-Za-z0-9]+)/i);
  const seatMatch = text.match(/Seat(?:s)?\s+([A-Za-z0-9,\s]+)/i);

  return makeTicket({
    id: msg.id,
    platform: 'ticketmaster',
    eventName,
    venue,
    city,
    date,
    time,
    quantity,
    orderNumber,
    confirmationEmailId: msg.id,
    section: sectionMatch?.[1],
    row: rowMatch?.[1],
    seat: seatMatch?.[1],
  });
}

// ─── StubHub ──────────────────────────────────────────────────────────────────
// Keep: "Thanks for your order - Order #X"
// Skip everything else

function parseStubhubTicket(msg: GmailMessage): Ticket | null {
  const headers = msg.payload?.headers ?? [];
  const get = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? '';
  const subject = get('Subject').trim();

  if (!/thanks for your order/i.test(subject)) return null;

  const body = extractBody(msg.payload);
  const text = stripHtml(body);

  // Order number from subject: "Thanks for your order - Order #634872039"
  const orderMatch = subject.match(/Order\s*#(\d+)/i) ?? text.match(/Order\s*#(\d+)/i);
  const orderNumber = orderMatch?.[1] ?? msg.id;

  // StubHub uses two email templates:
  //  A) event name BEFORE the date: "Wakyin  Saturday, January 31, 2026 - 10:00 pm"
  //  B) older: "...Saturday, January 31, 2026 | 22:00 (Event time subject to change)
  //     Wakyin  Main Space at Knockdown Center - Complex  2 Ticket(s)"
  //     (date first, 24h time, event name in its own bold cell after the marker)

  // ── Event name ──
  // Template A: event right before the weekday/date
  const evA = text.match(/([A-Z][A-Za-z0-9\s&'!:().-]{2,60}?)\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*day,\s+\w+\s+\d{1,2},\s+\d{4}/i);
  // Template B: the bold cell that follows "(Event time subject to change)" in the HTML
  const evB = body.match(/subject to change\)[\s\S]{0,800}?<span[^>]*>([^<]{2,60})<\/span>/i);
  const eventName = (evA?.[1] ?? evB?.[1] ?? '').trim();
  if (!eventName) return null; // can't identify event

  // ── Date (both templates carry "Weekday, Month DD, YYYY") ──
  const dMatch = text.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*day,\s+(\w+)\s+(\d{1,2}),\s+(\d{4})/i);
  let date = new Date().toISOString().split('T')[0];
  if (dMatch) {
    const d = new Date(`${dMatch[1]} ${dMatch[2]}, ${dMatch[3]}`);
    if (!isNaN(d.getTime())) date = d.toISOString().split('T')[0];
  }
  // Time: 12h "- 10:00 pm" (A) or 24h "| 22:00" (B)
  let time = '8:00 PM';
  const t12 = text.match(/(\d{1,2}:\d{2})\s*([ap]m)/i);
  const t24 = text.match(/\|\s*(\d{1,2}):(\d{2})\b/);
  if (t12) {
    time = `${t12[1]} ${t12[2].toUpperCase()}`;
  } else if (t24) {
    let h = parseInt(t24[1], 10); const m = t24[2];
    const ap = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12; else if (h > 12) h -= 12;
    time = `${h}:${m} ${ap}`;
  }

  // ── Venue: "...- Complex," (A) or "...- Complex " (B, no comma) ──
  let venueRaw = text.match(/([A-Za-z][A-Za-z0-9\s'&@.()-]{3,60}?)\s*-\s*Complex,/i)?.[1]?.trim() ?? '';
  if (!venueRaw) {
    // Template B: venue sits between the event name and "- Complex"
    const afterEvent = eventName ? (text.split(eventName)[1] ?? text) : text;
    venueRaw = afterEvent.match(/^\s*(.+?)\s*-\s*Complex\b/)?.[1]?.trim() ?? '';
  }
  venueRaw = venueRaw.replace(/^(?:AM|PM)\s+/i, '');
  const venue = venueRaw || 'Venue TBD';

  // City: "Complex, Maspeth" → Maspeth (template A only; B has no city)
  const cityFromComplex = text.match(/Complex,\s*([A-Za-z][A-Za-z\s]+?)(?:\s*Order|\s*\n|$)/i);
  const city = cityFromComplex?.[1]?.trim() ?? '';

  // Quantity: "2 Ticket(s)" (B) / "1 GA" / "Qty: N"
  const qtyMatch = text.match(/(\d+)\s+Ticket/i) ?? text.match(/(\d+)\s+GA/i) ?? text.match(/Qty\s*:?\s*(\d+)/i);
  const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;

  // Section/Row/Seat
  // Template B: "Section: General Admission Row: Seat(s): -"
  const sectionB = text.match(/Section:\s*([A-Za-z][A-Za-z0-9\s]{2,40}?)\s*(?:Row:|Seat|$)/i)?.[1]?.trim();
  // Template A table: "1 GA ENTRY ANYTIME N/A 113 - 113"
  const sectionA = text.match(/\b1\s+([A-Z][A-Z\s]{2,50}?)\s+(?:N\/A|[A-Za-z0-9]+)\s+\d+\s*-\s*\d+/)?.[1]?.trim();
  const sectionVal = sectionB ?? sectionA;
  const sectionMatch = sectionVal ? [null, sectionVal] : null;
  const rowRaw = text.match(/Row\s*:?\s*([A-Za-z0-9\/]+)/i)?.[1]?.trim();
  const rowMatch = (rowRaw && rowRaw.toUpperCase() !== 'N/A') ? [null, rowRaw] : null;

  return makeTicket({
    id: msg.id,
    platform: 'stubhub',
    eventName,
    venue,
    city,
    date,
    time,
    quantity,
    orderNumber,
    confirmationEmailId: msg.id,
    section: sectionMatch?.[1],
    row: rowMatch?.[1],
  });
}

// ─── TickPick ─────────────────────────────────────────────────────────────────
// Keep: "You Purchased Tickets on TickPick (Order Number X)"
//       "Your TickPick tickets are ready for delivery"
// Skip everything else

function parseTickpickTicket(msg: GmailMessage): Ticket | null {
  const headers = msg.payload?.headers ?? [];
  const get = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? '';
  const subject = get('Subject').trim();

  if (!/purchased tickets|order confirmed|your tickpick/i.test(subject)) return null;
  // Skip delivery-only emails — no event details in body
  if (/ready for delivery/i.test(subject)) return null;

  const body = extractBody(msg.payload);
  const text = stripHtml(body);

  // Order number — "Order: #665847715" or "Order Number 665847715" (in subject)
  const orderMatch = text.match(/Order:\s*#(\d+)/i)
    ?? text.match(/Order Number\s+(\d+)/i)
    ?? subject.match(/Order Number\s+(\d+)/i);
  const orderNumber = orderMatch?.[1] ?? msg.id;

  // Event name — "Event Name: Disclosure" followed by "Event Date:" or "Venue:"
  const eventMatch = text.match(/Event Name:\s*(.+?)(?=\s+Event Date:|\s+Venue:|\s+Section:|$)/i);
  const eventName = eventMatch?.[1]?.trim();
  if (!eventName) return null; // delivery email with no event details

  // Venue — "Venue: Knockdown Center" followed by "Event Date:" or "Section:"
  const venueMatch = text.match(/Venue:\s*(.+?)(?=\s+Event Date:|\s+Section:|\s+Row:|\s+Seat|$)/i);
  const venue = venueMatch?.[1]?.trim() ?? 'Venue TBD';

  // City — look near venue
  const cityMatch = text.match(/([A-Za-z][A-Za-z\s]{2,20}),\s*([A-Z]{2})\s+\d{5}/);
  const city = cityMatch ? `${cityMatch[1].trim()}, ${cityMatch[2]}` : '';

  // Date — "Event Date: Sat Oct 18, 2025 10:00PM"
  const dateMatch = text.match(/Event Date:\s+(?:\w+\s+)?(\w+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
  let date = new Date().toISOString().split('T')[0];
  let time = '8:00 PM';
  if (dateMatch) {
    const d = new Date(`${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]}`);
    if (!isNaN(d.getTime())) date = d.toISOString().split('T')[0];
    time = dateMatch[4];
  }

  // Quantity — "Quantity: x 1"
  const qtyMatch = text.match(/Quantity:\s*x\s*(\d+)/i) ?? text.match(/Quantity:\s*(\d+)/i);
  const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;

  // Section / Row / Seat
  const sectionMatch = text.match(/Section:\s*([A-Za-z0-9\s]+?)(?:\n|Row:|$)/i);
  const rowMatch = text.match(/Row:\s*([A-Za-z0-9]+)/i);
  const seatMatch = text.match(/Seats?:\s*([A-Za-z0-9,\s]+?)(?:\n|$)/i);

  return makeTicket({
    id: msg.id,
    platform: 'tickpick',
    eventName,
    venue,
    city,
    date,
    time,
    quantity,
    orderNumber,
    confirmationEmailId: msg.id,
    section: sectionMatch?.[1]?.trim(),
    row: rowMatch?.[1]?.trim(),
    seat: seatMatch?.[1]?.trim(),
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

// Targeted per-platform Gmail search queries — subject filters cut through newsletters
const PLATFORM_QUERIES: Record<Platform, string | null> = {
  dice: 'from:dice.fm',
  axs: 'from:axs.com (subject:"order" OR subject:"ticket" OR subject:"Thank you")',
  ticketmaster: 'from:ticketmaster.com (subject:"You Got Tickets" OR subject:"Ticket Order")',
  stubhub: 'from:stubhub.com subject:"Thanks for your order"',
  tickpick: 'from:tickpick.com (subject:"purchased" OR subject:"order" OR subject:"confirmation")',
  eventbrite: null,
  seatgeek: null,
};

// Fetch JSON with retry/backoff on rate-limit (429) and transient 5xx errors.
// Gmail rate-limits aggressively, so without this, concurrent message fetches
// fail intermittently and tickets silently disappear from the results.
async function fetchJsonWithRetry(
  url: string,
  accessToken: string,
  retries = 4
): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const backoff = 250 * 2 ** attempt + Math.random() * 150;
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    return res.json();
  }
}

// Run async work over a list with a bounded number of simultaneous tasks,
// so we never flood the Gmail API and trip its rate limiter.
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function fetchTicketsFromGmail(accessToken: string): Promise<Ticket[]> {
  // Run one targeted search per platform so newsletters don't eat the result limit
  const platformEntries = (Object.entries(PLATFORM_QUERIES) as [Platform, string | null][])
    .filter(([, q]) => q !== null);

  const messageIdSets = await Promise.all(
    platformEntries.map(async ([platform, query]) => {
      const q = encodeURIComponent(query!);
      const data = await fetchJsonWithRetry(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=100`,
        accessToken
      ) as { messages?: Array<{ id: string }>; error?: unknown };
      console.log(`[${platform}] found:${data.messages?.length ?? 0}`);
      return (data.messages ?? []).map((m) => ({ id: m.id, platform }));
    })
  );

  const allMessages = messageIdSets.flat();
  console.log('Total candidate messages:', allMessages.length);
  if (!allMessages.length) return [];

  const allTickets: Ticket[] = [];
  const refundedEventNames = new Set<string>(); // track DICE refunds

  // Bounded concurrency (6 at a time) + retry keeps us under Gmail's rate limit
  // so every candidate message is fetched and parsed on every run — making the
  // result set deterministic instead of varying between syncs.
  await mapWithConcurrency(allMessages, 10, async ({ id, platform }) => {
    const msg = await fetchJsonWithRetry(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      accessToken
    ) as GmailMessage & { error?: unknown };

    // If the fetch still failed after retries, skip rather than silently corrupt
    if (!msg || !msg.payload) {
      console.warn(`[fetch-fail] ${platform} message ${id} — no payload`);
      return;
    }

    const subject = msg.payload?.headers?.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';

    // Track DICE refunds — "Remboursement : 1 billet pour EVENT NAME"
    if (platform === 'dice' && DICE_REFUND.test(subject)) {
      const refundMatch = subject.match(/(?:Remboursement|Refund)\s*:\s*\d+\s+billet(?:s)?\s+pour\s+(.+)/i)
        ?? subject.match(/(?:Remboursement|Refund)\s*:\s*(.+)/i);
      if (refundMatch?.[1]) refundedEventNames.add(refundMatch[1].trim().toLowerCase());
      return;
    }

    let ticket: Ticket | null = null;
    if (platform === 'dice') ticket = parseDiceTicket(msg);
    else if (platform === 'axs') ticket = parseAxsTicket(msg);
    else if (platform === 'ticketmaster') ticket = parseTicketmasterTicket(msg);
    else if (platform === 'stubhub') ticket = parseStubhubTicket(msg);
    else if (platform === 'tickpick') ticket = parseTickpickTicket(msg);

    console.log(`[parse] ${platform} | "${subject}" → ${ticket ? `✓ "${ticket.eventName}"` : 'skipped'}`);
    if (ticket) allTickets.push(ticket);
  });

  // Remove refunded tickets
  const validTickets = allTickets.filter((t) => !refundedEventNames.has(t.eventName.toLowerCase()));

  // Deduplicate: keyed by eventName+date so same event on different dates (e.g. two RÜFÜS nights) are kept separate.
  // When same event+date has multiple orders (same platform), sum their quantities.
  // When same event+date appears on multiple platforms, prefer the primary ticketing platform.
  const PRIORITY: Record<Platform, number> = { dice: 5, axs: 4, ticketmaster: 3, tickpick: 2, stubhub: 1, eventbrite: 0, seatgeek: 0 };
  const best = new Map<string, Ticket>();
  const quantities = new Map<string, number>();
  for (const t of validTickets) {
    const key = `${t.eventName.toLowerCase().trim()}|${t.date}`;
    const existing = best.get(key);
    if (!existing || PRIORITY[t.platform] > PRIORITY[existing.platform]) {
      best.set(key, t);
    }
    // Always accumulate quantity across all orders for the same event+date
    quantities.set(key, (quantities.get(key) ?? 0) + t.quantity);
  }
  // Apply summed quantities
  for (const [key, ticket] of best) {
    best.set(key, { ...ticket, quantity: quantities.get(key) ?? ticket.quantity });
  }

  // Sort: upcoming first (soonest first), then past (most recent first).
  // Tiebreak same-date events by time of day.
  const now = new Date().toISOString().split('T')[0];
  const byDateTime = (a: Ticket, b: Ticket) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  };
  const upcoming = Array.from(best.values()).filter(t => t.date >= now).sort(byDateTime);
  const past = Array.from(best.values()).filter(t => t.date < now).sort((a, b) => -byDateTime(a, b));

  return [...upcoming, ...past];
}
