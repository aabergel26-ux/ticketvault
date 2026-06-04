import type { VercelRequest, VercelResponse } from '@vercel/node';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

/**
 * Exchanges a Google refresh token for a fresh access token.
 * The apps call this when a sync returns 401 (access token expired),
 * so the user never has to log in again.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Accept the refresh token from a JSON body or a query param
  const refreshToken =
    (req.body && (req.body as { refresh_token?: string }).refresh_token) ||
    (req.query.refresh_token as string | undefined);

  if (!refreshToken) {
    return res.status(400).json({ error: 'missing refresh_token' });
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
