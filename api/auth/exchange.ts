import type { VercelRequest, VercelResponse } from '@vercel/node';
import { decryptAuthCode, createSessionToken } from '../../server/session.js';
import { getUserByEmail } from '../../server/db.js';
import { checkRateLimit } from '../../server/rateLimit.js';

// x-forwarded-for may hold a comma-separated hop chain; the first entry is
// the original client (Vercel appends its own proxy IPs after it).
function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return first?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // POST only — the code should never appear in server logs via query strings
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Rate limit by IP to prevent brute-forcing encrypted codes.
  if (!checkRateLimit(getClientIp(req))) {
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  const code = (req.body as { code?: string } | undefined)?.code;
  if (!code) {
    return res.status(400).json({ error: 'Missing code in request body' });
  }

  // Decrypt the code — fails if invalid, tampered with, or expired (60s TTL)
  const payload = decryptAuthCode(code);
  if (!payload) {
    return res.status(400).json({ error: 'Invalid or expired code. Please log in again.' });
  }

  const user = await getUserByEmail(payload.email);
  if (!user) {
    return res.status(400).json({ error: 'Account not found. Please log in again.' });
  }

  // Return a session token — never the underlying Google tokens.
  const sessionToken = createSessionToken(payload.email);
  res.json({ session_token: sessionToken, email: payload.email });
}
