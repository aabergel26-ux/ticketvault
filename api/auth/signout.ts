import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySessionToken } from '../../server/session.js';
import { getUserByEmail, deleteUserByEmail } from '../../server/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const sessionToken = (req.body as { session_token?: string } | undefined)?.session_token;
  if (!sessionToken) {
    return res.status(400).json({ error: 'Missing session_token in request body' });
  }

  const session = verifySessionToken(sessionToken);
  if (!session) {
    // Already invalid/expired — nothing to revoke.
    return res.status(200).json({ ok: true });
  }

  const user = await getUserByEmail(session.email);
  if (user) {
    // Revoke whichever token we have — Google accepts either an access or
    // refresh token at the revoke endpoint and invalidates the whole grant.
    const tokenToRevoke = user.google_refresh_token ?? user.google_access_token;
    if (tokenToRevoke) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`, {
        method: 'POST',
      }).catch(() => {
        // Best-effort — still delete the local user row below.
      });
    }
    await deleteUserByEmail(session.email);
  }

  res.status(200).json({ ok: true });
}
