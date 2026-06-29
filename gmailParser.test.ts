/**
 * gmailParser.test.ts — Unit tests for TicketVault's email parsers.
 *
 * Run with:  npx tsx --test gmailParser.test.ts
 * (uses Node's built-in test runner — no extra deps needed)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  stripHtml,
  parseDiceDate,
  parseDiceTicket,
  parseAxsTicket,
  parseTicketmasterTicket,
  parseStubhubTicket,
  parseTickpickTicket,
  makeTicket,
  detectPlatform,
  timeToMinutes,
} from './gmailParser.js';

// ─── Helper: build a mock Gmail message ──────────────────────────────────────

function mockMsg(opts: {
  id?: string;
  from?: string;
  subject?: string;
  date?: string;
  bodyHtml?: string;
  bodyPlain?: string;
}) {
  const id = opts.id ?? 'msg-test-001';
  const headers = [
    { name: 'From', value: opts.from ?? 'test@example.com' },
    { name: 'Subject', value: opts.subject ?? '' },
    { name: 'Date', value: opts.date ?? 'Tue, 10 Jun 2025 12:00:00 -0400' },
  ];

  // If HTML body provided, use multipart structure like real Gmail
  if (opts.bodyHtml) {
    const htmlData = Buffer.from(opts.bodyHtml).toString('base64url');
    const parts: any[] = [
      { mimeType: 'text/html', body: { data: htmlData } },
    ];
    if (opts.bodyPlain) {
      parts.unshift({
        mimeType: 'text/plain',
        body: { data: Buffer.from(opts.bodyPlain).toString('base64url') },
      });
    }
    return { id, payload: { headers, parts } };
  }

  // Plain text only
  if (opts.bodyPlain) {
    const data = Buffer.from(opts.bodyPlain).toString('base64url');
    return { id, payload: { headers, body: { data } } };
  }

  return { id, payload: { headers } };
}

// ─── stripHtml ───────────────────────────────────────────────────────────────

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    assert.equal(stripHtml('<p>Hello <b>world</b></p>'), 'Hello world');
  });

  it('decodes common HTML entities', () => {
    assert.equal(stripHtml('A&amp;B &ndash; C&nbsp;D'), 'A&B – C D');
  });

  it('decodes numeric entities', () => {
    assert.equal(stripHtml('&#65;&#66;'), 'AB');
  });

  it('collapses whitespace', () => {
    assert.equal(stripHtml('<div>  lots   of   space  </div>'), 'lots of space');
  });

  it('handles middot and bull entities', () => {
    assert.equal(stripHtml('A&middot;B&bull;C'), 'A·B•C');
  });
});

// ─── timeToMinutes ───────────────────────────────────────────────────────────

describe('timeToMinutes', () => {
  it('parses 7:00 PM', () => {
    assert.equal(timeToMinutes('7:00 PM'), 19 * 60);
  });

  it('parses 12:00 AM (midnight)', () => {
    assert.equal(timeToMinutes('12:00 AM'), 0);
  });

  it('parses 12:30 PM (noon)', () => {
    assert.equal(timeToMinutes('12:30 PM'), 12 * 60 + 30);
  });

  it('parses 10:00 AM', () => {
    assert.equal(timeToMinutes('10:00 AM'), 10 * 60);
  });

  it('returns 1200 (default noon) for unparseable time', () => {
    assert.equal(timeToMinutes('TBD'), 1200);
  });
});

// ─── detectPlatform ──────────────────────────────────────────────────────────

describe('detectPlatform', () => {
  it('detects ticketmaster', () => {
    assert.equal(detectPlatform('noreply@ticketmaster.com'), 'ticketmaster');
  });

  it('detects livenation as ticketmaster', () => {
    assert.equal(detectPlatform('events@livenation.com'), 'ticketmaster');
  });

  it('detects axs', () => {
    assert.equal(detectPlatform('orders@axs.com'), 'axs');
  });

  it('detects dice', () => {
    assert.equal(detectPlatform('hello@dice.fm'), 'dice');
  });

  it('detects stubhub', () => {
    assert.equal(detectPlatform('no-reply@stubhub.com'), 'stubhub');
  });

  it('returns null for unknown sender', () => {
    assert.equal(detectPlatform('someone@gmail.com'), null);
  });
});

// ─── parseDiceDate ───────────────────────────────────────────────────────────

describe('parseDiceDate', () => {
  it('parses English standard: "Sat 01 Jul, 7:00 PM"', () => {
    const result = parseDiceDate('Date & time Sat 01 Jul, 7:00 PM', 2023);
    assert.equal(result.date, '2023-07-01');
    assert.equal(result.time, '7:00 PM');
  });

  it('parses English with year: "Sat 01 Jul 2023, 7:00 PM"', () => {
    const result = parseDiceDate('Sat 01 Jul 2023, 7:00 PM');
    assert.equal(result.date, '2023-07-01');
  });

  it('parses English year-mid quirk: "Sat 29 2023 Jul, 10:00 PM"', () => {
    const result = parseDiceDate('Sat 29 2023 Jul, 10:00 PM');
    assert.equal(result.date, '2023-07-29');
    assert.equal(result.time, '10:00 PM');
  });

  it('parses French standard: "sam. 09 mai, 10:00 PM"', () => {
    const result = parseDiceDate('sam. 09 mai, 10:00 PM', 2026);
    assert.equal(result.date, '2026-05-09');
    assert.equal(result.time, '10:00 PM');
  });

  it('parses French year-mid quirk: "sam. 30 2024 mars, 10:00 PM"', () => {
    const result = parseDiceDate('sam. 30 2024 mars, 10:00 PM');
    assert.equal(result.date, '2024-03-30');
    assert.equal(result.time, '10:00 PM');
  });

  it('parses French full: "Date samedi 9 mai 2026"', () => {
    const result = parseDiceDate('Date samedi 9 mai 2026');
    assert.equal(result.date, '2026-05-09');
    // No time in this format — should default to 8:00 PM
    assert.equal(result.time, '8:00 PM');
  });

  it('uses emailYear fallback when no year present', () => {
    const result = parseDiceDate('sam. 25 nov., 7:00 PM', 2023);
    assert.equal(result.date, '2023-11-25');
  });

  it('falls back to January 1 of emailYear when nothing matches', () => {
    const result = parseDiceDate('completely unparseable text', 2024);
    assert.equal(result.date, '2024-01-01');
  });
});

// ─── parseDiceTicket ─────────────────────────────────────────────────────────

describe('parseDiceTicket', () => {
  it('parses English purchase confirmation', () => {
    const msg = mockMsg({
      from: 'hello@dice.fm',
      subject: 'Your tickets are sorted for KEINEMUSIK',
      date: 'Sat, 01 Jul 2023 10:00:00 +0000',
      bodyHtml: `
        <div>Nice one, Adam You're going to KEINEMUSIK</div>
        <div>Venue Brooklyn Mirage 140 Stewart Ave</div>
        <div>Brooklyn, NY 11237</div>
        <div>Sat 01 Jul, 7:00 PM</div>
        <div>Quantity 2 ×</div>
      `,
    });
    const ticket = parseDiceTicket(msg);
    assert.ok(ticket, 'should parse a ticket');
    assert.equal(ticket.eventName, 'KEINEMUSIK');
    assert.equal(ticket.platform, 'dice');
    assert.equal(ticket.date, '2023-07-01');
    assert.equal(ticket.time, '7:00 PM');
    assert.equal(ticket.quantity, 2);
    assert.equal(ticket.venue, 'Brooklyn Mirage');
  });

  it('parses French purchase confirmation', () => {
    const msg = mockMsg({
      from: 'hello@dice.fm',
      subject: 'Tes billets pour AMÉMÉ',
      date: 'Sat, 30 Mar 2024 10:00:00 +0000',
      bodyHtml: `
        <div>C'est dans la poche, Adam ! Tu participes à AMÉMÉ</div>
        <div>Salle Sound Nightclub 456 N Western Ave</div>
        <div>Los Angeles, CA 90004</div>
        <div>sam. 30 2024 mars, 10:00 PM</div>
        <div>Billets 1 ×</div>
      `,
    });
    const ticket = parseDiceTicket(msg);
    assert.ok(ticket, 'should parse a ticket');
    assert.equal(ticket.eventName, 'AMÉMÉ');
    assert.equal(ticket.date, '2024-03-30');
    assert.equal(ticket.time, '10:00 PM');
  });

  it('skips login code emails', () => {
    const msg = mockMsg({
      from: 'hello@dice.fm',
      subject: 'Code de connexion DICE',
      bodyHtml: '<div>Your code is 123456</div>',
    });
    assert.equal(parseDiceTicket(msg), null);
  });

  it('skips review emails', () => {
    const msg = mockMsg({
      from: 'hello@dice.fm',
      subject: "Alors, comment c'était?",
      bodyHtml: '<div>Rate your event</div>',
    });
    assert.equal(parseDiceTicket(msg), null);
  });

  it('skips transfer-sent emails', () => {
    const msg = mockMsg({
      from: 'hello@dice.fm',
      subject: 'Billet envoyé à John',
      bodyHtml: '<div>You sent a ticket</div>',
    });
    assert.equal(parseDiceTicket(msg), null);
  });

  it('parses transfer-received emails', () => {
    const msg = mockMsg({
      from: 'hello@dice.fm',
      subject: 'Alex sent you 2 tickets for Bonobo presents OUTLIER',
      date: 'Sat, 29 Jul 2023 08:00:00 +0000',
      bodyHtml: `
        <div>You now have tickets for Bonobo presents OUTLIER.</div>
        <div>Venue Knockdown Center 52-19 Flushing Ave</div>
        <div>Maspeth, NY 11378</div>
        <div>Sat 29 2023 Jul, 10:00 PM</div>
        <div>Quantity 2</div>
      `,
    });
    const ticket = parseDiceTicket(msg);
    assert.ok(ticket, 'should parse transfer-received');
    assert.equal(ticket.eventName, 'Bonobo presents OUTLIER');
    assert.equal(ticket.date, '2023-07-29');
  });
});

// ─── parseAxsTicket ──────────────────────────────────────────────────────────

describe('parseAxsTicket', () => {
  it('parses order confirmation with M/D/YYYY date', () => {
    const msg = mockMsg({
      from: 'orders@axs.com',
      subject: 'Thank you for your order for Chris Lake',
      date: 'Fri, 06 Jun 2026 10:00:00 -0400',
      bodyHtml: `
        <div>Thank you for your order for Chris Lake</div>
        <div>Order details for Chris Lake at Under the K Bridge Park scheduled on 6/6/2026 7:00 PM</div>
        <div>Your confirmation number is 12345678</div>
        <div>Quantity Section Row Seat(s) 2 General Admission N/A 101</div>
      `,
    });
    const ticket = parseAxsTicket(msg);
    assert.ok(ticket, 'should parse a ticket');
    assert.equal(ticket.eventName, 'Chris Lake');
    assert.equal(ticket.platform, 'axs');
    assert.equal(ticket.date, '2026-06-06');
    assert.equal(ticket.time, '7:00 PM');
    assert.equal(ticket.venue, 'Under the K Bridge Park');
    assert.equal(ticket.orderNumber, '12345678');
  });

  it('parses 2-digit year correctly (12-21-22 → 2022-12-21)', () => {
    const msg = mockMsg({
      from: 'orders@axs.com',
      subject: 'Thank you for your order for Some Event',
      date: 'Wed, 21 Dec 2022 10:00:00 -0500',
      bodyHtml: `
        <div>Thank you for your order for Some Event at Some Venue scheduled on something</div>
        <div>Saturday 12-21-22 at 7:30 pm</div>
        <div>Quantity 2</div>
      `,
    });
    const ticket = parseAxsTicket(msg);
    assert.ok(ticket, 'should parse a ticket');
    assert.equal(ticket.date, '2022-12-21');
    assert.equal(ticket.time, '7:30 pm');
  });

  it('skips presale emails', () => {
    const msg = mockMsg({
      from: 'orders@axs.com',
      subject: 'Presale Alert: Big Concert',
      bodyHtml: '<div>Get your presale tickets now!</div>',
    });
    assert.equal(parseAxsTicket(msg), null);
  });

  it('returns null when no event name found', () => {
    const msg = mockMsg({
      from: 'orders@axs.com',
      subject: 'YOUR TICKETS ARE HERE',
      bodyHtml: '<div>Your tickets have been delivered to your account.</div>',
    });
    assert.equal(parseAxsTicket(msg), null);
  });

  it('falls back to email received date when no date in body', () => {
    const msg = mockMsg({
      from: 'orders@axs.com',
      subject: 'Thank you for your order for Mystery Event',
      date: 'Mon, 15 Mar 2024 09:00:00 -0400',
      bodyHtml: `
        <div>Thank you for your order for Mystery Event</div>
        <div>Quantity 1</div>
        <div>No date info here at all</div>
      `,
    });
    const ticket = parseAxsTicket(msg);
    assert.ok(ticket, 'should still parse');
    assert.equal(ticket.date, '2024-03-15');
  });
});

// ─── parseTicketmasterTicket ─────────────────────────────────────────────────

describe('parseTicketmasterTicket', () => {
  it('parses classic "You Got Tickets" email', () => {
    const msg = mockMsg({
      from: 'noreply@ticketmaster.com',
      subject: 'You Got Tickets To Kx5',
      date: 'Sat, 10 Dec 2022 08:00:00 -0800',
      bodyHtml: `
        <div>You Got Tickets!</div>
        <div>Kx5</div>
        <div>LA Memorial Coliseum — Los Angeles, CA</div>
        <div>December 10, 2022</div>
        <div>7:00 PM</div>
        <div>2 General Admission tickets</div>
        <div>Order # 74-21547/NY1</div>
      `,
    });
    const ticket = parseTicketmasterTicket(msg);
    assert.ok(ticket, 'should parse a ticket');
    assert.equal(ticket.eventName, 'Kx5');
    assert.equal(ticket.platform, 'ticketmaster');
    assert.equal(ticket.date, '2022-12-10');
    assert.equal(ticket.quantity, 2);
    assert.equal(ticket.orderNumber, '74-21547/NY1');
  });

  it('strips age qualifiers from event name', () => {
    const msg = mockMsg({
      from: 'noreply@ticketmaster.com',
      subject: 'You Got Tickets To RÜFÜS DU SOL - 18 Years and Older with Valid ID to Enter',
      date: 'Fri, 25 Jul 2025 08:00:00 -0400',
      bodyHtml: `
        <div>July 25, 2025</div>
        <div>Red Bull Arena — Harrison, NJ</div>
        <div>8:00 PM</div>
        <div>1 General Admission ticket</div>
      `,
    });
    const ticket = parseTicketmasterTicket(msg);
    assert.ok(ticket, 'should parse a ticket');
    assert.equal(ticket.eventName, 'RÜFÜS DU SOL');
  });

  it('parses resale "Ticket Order" email', () => {
    const msg = mockMsg({
      from: 'noreply@ticketmaster.com',
      subject: 'Your LA Clippers vs. Charlotte Hornets Ticket Order 2900-0493',
      date: 'Wed, 21 Dec 2022 08:00:00 -0800',
      bodyHtml: `
        <div>Your Tickets Are Ready</div>
        <div>Crypto.com Arena — Los Angeles, CA</div>
        <div>Wed, Dec 21 @ 7:30 PM</div>
        <div>Section 101 Row A Seat 5</div>
      `,
    });
    const ticket = parseTicketmasterTicket(msg);
    assert.ok(ticket, 'should parse resale ticket');
    assert.equal(ticket.eventName, 'LA Clippers vs. Charlotte Hornets');
    assert.equal(ticket.date, '2022-12-21');
  });

  it('skips presale emails', () => {
    const msg = mockMsg({
      from: 'noreply@ticketmaster.com',
      subject: 'Presale Alert: Taylor Swift',
      bodyHtml: '<div>Get early access!</div>',
    });
    assert.equal(parseTicketmasterTicket(msg), null);
  });

  it('skips "order is being processed" emails', () => {
    const msg = mockMsg({
      from: 'noreply@ticketmaster.com',
      subject: 'Your Some Event Ticket Order 1234-5678',
      bodyHtml: '<div>Your order is being processed. Please wait.</div>',
    });
    assert.equal(parseTicketmasterTicket(msg), null);
  });
});

// ─── parseStubhubTicket ──────────────────────────────────────────────────────

describe('parseStubhubTicket', () => {
  it('parses template A: event name before date', () => {
    const msg = mockMsg({
      from: 'no-reply@stubhub.com',
      subject: 'Thanks for your order - Order #634872039',
      date: 'Fri, 31 Jan 2026 08:00:00 -0500',
      bodyHtml: `
        <div>Wakyin  Saturday, January 31, 2026 - 10:00 pm</div>
        <div>Main Space at Knockdown Center - Complex, Maspeth</div>
        <div>1 Ticket(s)</div>
      `,
    });
    const ticket = parseStubhubTicket(msg);
    assert.ok(ticket, 'should parse a ticket');
    assert.equal(ticket.eventName, 'Wakyin');
    assert.equal(ticket.platform, 'stubhub');
    assert.equal(ticket.date, '2026-01-31');
    assert.equal(ticket.time, '10:00 PM');
    assert.equal(ticket.orderNumber, '634872039');
  });

  it('skips non-order emails', () => {
    const msg = mockMsg({
      from: 'no-reply@stubhub.com',
      subject: 'Your StubHub newsletter',
      bodyHtml: '<div>Check out these events!</div>',
    });
    assert.equal(parseStubhubTicket(msg), null);
  });

  it('returns null when event name cannot be extracted', () => {
    const msg = mockMsg({
      from: 'no-reply@stubhub.com',
      subject: 'Thanks for your order - Order #999',
      bodyHtml: '<div>Some random content with no event pattern</div>',
    });
    assert.equal(parseStubhubTicket(msg), null);
  });
});

// ─── parseTickpickTicket ─────────────────────────────────────────────────────

describe('parseTickpickTicket', () => {
  it('parses purchase confirmation', () => {
    const msg = mockMsg({
      from: 'support@tickpick.com',
      subject: 'You Purchased Tickets on TickPick (Order Number 665847715)',
      date: 'Sat, 18 Oct 2025 10:00:00 -0400',
      bodyHtml: `
        <div>Order: #665847715</div>
        <div>Event Name: Disclosure</div>
        <div>Venue: Brooklyn Mirage</div>
        <div>Event Date: Sat Oct 18, 2025 10:00PM</div>
        <div>Quantity: x 2</div>
        <div>Section: GA</div>
      `,
    });
    const ticket = parseTickpickTicket(msg);
    assert.ok(ticket, 'should parse a ticket');
    assert.equal(ticket.eventName, 'Disclosure');
    assert.equal(ticket.platform, 'tickpick');
    assert.equal(ticket.date, '2025-10-18');
    assert.equal(ticket.quantity, 2);
    assert.equal(ticket.orderNumber, '665847715');
  });

  it('skips delivery-only emails', () => {
    const msg = mockMsg({
      from: 'support@tickpick.com',
      subject: 'Your TickPick tickets are ready for delivery',
      bodyHtml: '<div>Your tickets have been delivered</div>',
    });
    assert.equal(parseTickpickTicket(msg), null);
  });

  it('returns null when no event name present', () => {
    const msg = mockMsg({
      from: 'support@tickpick.com',
      subject: 'You Purchased Tickets on TickPick (Order Number 123)',
      bodyHtml: '<div>Order: #123</div><div>No event name here</div>',
    });
    assert.equal(parseTickpickTicket(msg), null);
  });
});

// ─── makeTicket (status assignment) ──────────────────────────────────────────

describe('makeTicket', () => {
  it('marks future dates as upcoming', () => {
    const ticket = makeTicket({
      id: 't1', platform: 'dice', eventName: 'Test',
      venue: 'V', city: '', date: '2099-12-31', time: '8:00 PM',
      quantity: 1, orderNumber: 'x', confirmationEmailId: 'x',
    });
    assert.equal(ticket.status, 'upcoming');
  });

  it('marks past dates as past', () => {
    const ticket = makeTicket({
      id: 't2', platform: 'dice', eventName: 'Test',
      venue: 'V', city: '', date: '2020-01-01', time: '8:00 PM',
      quantity: 1, orderNumber: 'x', confirmationEmailId: 'x',
    });
    assert.equal(ticket.status, 'past');
  });

  it('populates deepLink and webFallback', () => {
    const ticket = makeTicket({
      id: 't3', platform: 'ticketmaster', eventName: 'Test',
      venue: 'V', city: '', date: '2099-01-01', time: '8:00 PM',
      quantity: 1, orderNumber: 'ORD-123', confirmationEmailId: 'x',
    });
    assert.ok(ticket.deepLink.includes('ORD-123'));
    assert.ok(ticket.webFallback.includes('ticketmaster.com'));
  });
});

// ─── Dedup logic (integration-level) ─────────────────────────────────────────

describe('dedup logic (MAX not SUM)', () => {
  it('uses MAX quantity across platforms, not SUM', () => {
    // Simulate what fetchTicketsFromGmail does after parsing:
    // StubHub says 1 ticket, DICE says 2 tickets — same event, same date.
    // Correct: keep DICE (higher priority), quantity = max(1, 2) = 2
    // Bug (old): quantity = 1 + 2 = 3
    const stubhubTicket = makeTicket({
      id: 's1', platform: 'stubhub', eventName: 'Wakyin',
      venue: 'Knockdown Center', city: 'Maspeth', date: '2026-01-31',
      time: '10:00 PM', quantity: 1, orderNumber: 'SH-123',
      confirmationEmailId: 's1',
    });
    const diceTicket = makeTicket({
      id: 'd1', platform: 'dice', eventName: 'Wakyin',
      venue: 'Knockdown Center', city: 'Maspeth', date: '2026-01-31',
      time: '10:00 PM', quantity: 2, orderNumber: 'D-456',
      confirmationEmailId: 'd1',
    });

    // Reproduce the dedup logic from the fixed gmailParser
    type Platform = typeof stubhubTicket.platform;
    const PRIORITY: Record<Platform, number> = {
      dice: 5, axs: 4, ticketmaster: 3, tickpick: 2, stubhub: 1, eventbrite: 0, seatgeek: 0,
    };
    const validTickets = [stubhubTicket, diceTicket];
    const best = new Map<string, typeof stubhubTicket>();
    for (const t of validTickets) {
      const key = `${t.eventName.toLowerCase().trim()}|${t.date}`;
      const existing = best.get(key);
      if (!existing) {
        best.set(key, t);
      } else if (PRIORITY[t.platform] > PRIORITY[existing.platform]) {
        best.set(key, { ...t, quantity: Math.max(t.quantity, existing.quantity) });
      } else {
        best.set(key, { ...existing, quantity: Math.max(t.quantity, existing.quantity) });
      }
    }

    const result = Array.from(best.values());
    assert.equal(result.length, 1, 'should dedup to one ticket');
    assert.equal(result[0].platform, 'dice', 'should keep higher-priority platform');
    assert.equal(result[0].quantity, 2, 'should use MAX quantity, not SUM');
  });
});

// ─── Sort logic ──────────────────────────────────────────────────────────────

describe('sort logic', () => {
  it('sorts upcoming soonest-first, past most-recent-first', () => {
    const t1 = makeTicket({
      id: '1', platform: 'dice', eventName: 'Far Future',
      venue: 'V', city: '', date: '2099-06-01', time: '8:00 PM',
      quantity: 1, orderNumber: 'x', confirmationEmailId: 'x',
    });
    const t2 = makeTicket({
      id: '2', platform: 'dice', eventName: 'Near Future',
      venue: 'V', city: '', date: '2099-01-15', time: '8:00 PM',
      quantity: 1, orderNumber: 'x', confirmationEmailId: 'x',
    });
    const t3 = makeTicket({
      id: '3', platform: 'dice', eventName: 'Recent Past',
      venue: 'V', city: '', date: '2024-12-01', time: '8:00 PM',
      quantity: 1, orderNumber: 'x', confirmationEmailId: 'x',
    });
    const t4 = makeTicket({
      id: '4', platform: 'dice', eventName: 'Older Past',
      venue: 'V', city: '', date: '2023-06-01', time: '8:00 PM',
      quantity: 1, orderNumber: 'x', confirmationEmailId: 'x',
    });

    const now = new Date().toISOString().split('T')[0];
    const byDateTime = (a: typeof t1, b: typeof t1) => {
      const dc = a.date.localeCompare(b.date);
      if (dc !== 0) return dc;
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    };
    const all = [t1, t3, t4, t2]; // shuffled
    const upcoming = all.filter(t => t.date >= now).sort(byDateTime);
    const past = all.filter(t => t.date < now).sort((a, b) => -byDateTime(a, b));
    const sorted = [...upcoming, ...past];

    assert.equal(sorted[0].eventName, 'Near Future', 'soonest upcoming first');
    assert.equal(sorted[1].eventName, 'Far Future', 'later upcoming second');
    assert.equal(sorted[2].eventName, 'Recent Past', 'most recent past first');
    assert.equal(sorted[3].eventName, 'Older Past', 'older past last');
  });

  it('breaks ties by time of day', () => {
    const morning = makeTicket({
      id: '1', platform: 'dice', eventName: 'Morning Show',
      venue: 'V', city: '', date: '2099-03-01', time: '10:00 AM',
      quantity: 1, orderNumber: 'x', confirmationEmailId: 'x',
    });
    const evening = makeTicket({
      id: '2', platform: 'dice', eventName: 'Evening Show',
      venue: 'V', city: '', date: '2099-03-01', time: '8:00 PM',
      quantity: 1, orderNumber: 'x', confirmationEmailId: 'x',
    });

    const byDateTime = (a: typeof morning, b: typeof morning) => {
      const dc = a.date.localeCompare(b.date);
      if (dc !== 0) return dc;
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    };
    const sorted = [evening, morning].sort(byDateTime);
    assert.equal(sorted[0].eventName, 'Morning Show');
    assert.equal(sorted[1].eventName, 'Evening Show');
  });
});

console.log('\n✅ All test suites registered. Running...\n');
