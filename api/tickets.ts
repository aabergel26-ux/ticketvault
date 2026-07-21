import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { verifySessionToken } from '../server/session.js';
import { getUserByEmail, getTicketsByUser } from '../server/db.js';
import { checkRateLimit } from '../server/rateLimit.js';

// Fast path: reads straight from Supabase, never calls Gmail or Google.
// If the cache is stale (or this is a first-ever sync), the client is told
// to follow up with /api/sync, which does the heavy lifting.
const FRESH_WINDOW_MS = 5 * 60 * 1000;

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

  try {
    const tickets = await getTicketsByUser(user.id);
    const lastSyncMs = user.last_sync_at ? new Date(user.last_sync_at).getTime() : 0;
    const syncing = !user.last_sync_at || Date.now() - lastSyncMs >= FRESH_WINDOW_MS;

    res.json({ tickets, syncing });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load cached tickets' });
  }
}
