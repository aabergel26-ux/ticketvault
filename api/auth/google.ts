import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const REDIRECT_URI = process.env.REDIRECT_URI!;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Generate a random state nonce to prevent CSRF attacks.
  // The nonce is stored in a short-lived httpOnly cookie and passed to Google
  // as the `state` param. callback.ts verifies they match before issuing tokens.
  const nonce = crypto.randomBytes(16).toString('hex');

  // For mobile Auth, the client passes ?mobile=1&mobileRedirect=exp://...
  // We prefix the nonce with the mobile redirect so callback.ts can extract it.
  const mobileRedirect = req.query.mobileRedirect as string | undefined;
  const state = mobileRedirect
    ? `mobile:${mobileRedirect}:${nonce}`
    : nonce;

  // Set the nonce as an httpOnly cookie (5 min TTL, enough for the OAuth flow)
  res.setHeader('Set-Cookie', [
    `tv_oauth_state=${nonce}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300`,
  ]);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}