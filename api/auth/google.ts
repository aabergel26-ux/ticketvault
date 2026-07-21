import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { signState } from '../../server/session.js';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const REDIRECT_URI = process.env.REDIRECT_URI!;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Generate a random state nonce to prevent CSRF attacks. Rather than storing
  // it server-side (a cookie set here doesn't reliably survive the redirect
  // to Google and back on Vercel), we sign it with TOKEN_ENCRYPTION_KEY and
  // send "nonce.signature" as the `state` param. callback.ts recomputes the
  // signature to verify the callback wasn't forged.
  const nonce = crypto.randomBytes(16).toString('hex');
  const signedNonce = `${nonce}.${signState(nonce)}`;

  // For mobile Auth, the client passes ?mobile=1&mobileRedirect=exp://...
  // We prefix the signed nonce with the mobile redirect so callback.ts can extract it.
  const mobileRedirect = req.query.mobileRedirect as string | undefined;
  const state = mobileRedirect
    ? `mobile:${mobileRedirect}:${signedNonce}`
    : signedNonce;

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