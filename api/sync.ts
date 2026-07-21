import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { fetchTicketsFromGmail } from '../server/gmailParser.js';
import { verifySessionToken } from '../server/session.js';
import {
  getUserByEmail,
  upsertUser,
  getTicketsByUser,
  upsertTickets,
  updateLastSyncAt,
} from '../server/db.js';
import { checkRateLimit } from '../server/rateLimit.js';

// Heavy path: refreshes the Google token if needed, pulls new messages from
// Gmail, upserts them into Supabase, and returns the full ticket list.
// Allowed to run the full 30s — the client calls this only after /api/tickets
// has already shown cached data, so nothing is blocked on this request.

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokens = await tokenRes.json() as { access_token?: string; expires_in?: number; error?: string };
  if (tokens.error || !tokens.access_token) return null;
  return { access_token: tokens.access_token, expires_in: tokens.expires_in ?? 3600 };
}

// Gmail's after: operator has day (not time) granularity, so step back a day
// to guarantee overlap with the last sync rather than risk missing messages
// received earlier the same calendar day. Re-fetched messages are harmless —
// upsertTickets dedupes on (user_id, gmail_message_id).
function toGmailAfterDate(lastSyncAt: string): string {
  const d = new Date(lastSyncAt);
  d.setUTCDate(d.getUTCDate() - 1);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = auth.slice(7);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  if (!checkRateLimit(tokenHash)) {
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  const session = verifySessionToken(token);
  if (!session) return res.status(401).json({ error: 'Invalid or expired session' });

  const user = await getUserByEmail(session.email);
  if (!user) return res.status(401).json({ error: 'Account not found. Please reconnect.' });

  // Refresh the Google access token if it's missing or close to expiring.
  let accessToken = user.google_access_token;
  const expiresAtMs = user.token_expires_at ? new Date(user.token_expires_at).getTime() : 0;
  const needsRefresh = !accessToken || Date.now() > expiresAtMs - 60_000;

  if (needsRefresh) {
    if (!user.google_refresh_token) {
      return res.status(401).json({ error: 'No refresh token on file. Please reconnect.' });
    }

    const refreshed = await refreshGoogleAccessToken(user.google_refresh_token);
    if (!refreshed) {
      return res.status(401).json({ error: 'Failed to refresh Google token. Please reconnect.' });
    }

    accessToken = refreshed.access_token;
    await upsertUser({
      email: user.email,
      googleAccessToken: refreshed.access_token,
      tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    });
  }

  try {
    // First sync ever: full mailbox search. Otherwise: only messages since last sync.
    const afterDate = user.last_sync_at ? toGmailAfterDate(user.last_sync_at) : undefined;
    const newTickets = await fetchTicketsFromGmail(accessToken!, afterDate);

    await upsertTickets(user.id, newTickets);
    await updateLastSyncAt(user.id);

    const allTickets = await getTicketsByUser(user.id);
    res.json({ tickets: allTickets, syncing: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
}
