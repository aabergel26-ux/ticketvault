import type { VercelRequest, VercelResponse } from '@vercel/node';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

/**
 * Exchanges a Google refresh token for a fresh access token.
 * The web client no longer calls this — api/tickets.ts refreshes server-side
 * using the token stored in Supabase. Kept for the mobile app, which still
 * holds its own Google tokens directly (mobile auth flow is unchanged).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // POST only — refresh tokens must never appear in query strings (they'd leak
  // into server logs, browser history, and Vercel's request logs).
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const refreshToken = (req.body as { refresh_token?: string } | undefined)?.refresh_token;

  if (!refreshToken) {
    return res.status(400).json({ error: 'missing refresh_token in request body' });
  }

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

  const tokens = await tokenRes.json() as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (tokens.error || !tokens.access_token) {
    // refresh token revoked or invalid — caller should prompt re-login
    return res.status(401).json({ error: tokens.error ?? 'refresh_failed' });
  }

  res.json({ access_token: tokens.access_token, expires_in: tokens.expires_in });
}