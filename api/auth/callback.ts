import type { VercelRequest, VercelResponse } from '@vercel/node';
import { upsertUser } from '../../server/db.js';
import { createSessionToken, encryptAuthCode, verifyState } from '../../server/session.js';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = process.env.REDIRECT_URI!;
const FRONTEND_URL = process.env.FRONTEND_URL!;

// Only allow redirects to known app schemes — prevents open redirect attacks.
const ALLOWED_MOBILE_SCHEMES = [
  'exp://',            // Expo Go during development
  'ticketvault://',    // Standalone app custom scheme
];

function isAllowedMobileRedirect(uri: string): boolean {
  return ALLOWED_MOBILE_SCHEMES.some((scheme) => uri.startsWith(scheme));
}

// Parse the state param and extract the signed nonce ("nonce.signature") +
// optional mobile redirect.
function parseState(state: string): { signedNonce: string; mobileRedirect: string | null } {
  if (state.startsWith('mobile:')) {
    // Format: "mobile:REDIRECT_URI:NONCE.SIGNATURE"
    // The redirect URI may contain colons (exp://host:port), so split from the right:
    // find the last colon — that separates the signed nonce from the redirect URI.
    const afterPrefix = state.slice(7); // remove "mobile:"
    const lastColon = afterPrefix.lastIndexOf(':');
    if (lastColon === -1) return { signedNonce: afterPrefix, mobileRedirect: null };
    return {
      mobileRedirect: afterPrefix.slice(0, lastColon),
      signedNonce: afterPrefix.slice(lastColon + 1),
    };
  }
  return { signedNonce: state, mobileRedirect: null };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string;
  const stateParam = req.query.state as string | undefined;

  if (!code) return res.status(400).send('Missing code');
  if (!stateParam) return res.status(400).send('Missing state');

  // ── CSRF verification ──────────────────────────────────────────────────────
  // No server-side storage of the nonce (a cookie set in google.ts doesn't
  // reliably survive the round trip to Google on Vercel) — instead the state
  // param carries "nonce.signature", and we recompute the HMAC here.
  const { signedNonce, mobileRedirect: mobileRedirectRaw } = parseState(stateParam);
  const dotIndex = signedNonce.lastIndexOf('.');

  if (dotIndex === -1) {
    console.warn('[auth] Malformed state parameter — rejecting callback');
    return res.status(403).send('Invalid state parameter. Please try logging in again.');
  }

  const nonce = signedNonce.slice(0, dotIndex);
  const signature = signedNonce.slice(dotIndex + 1);

  if (!verifyState(nonce, signature)) {
    console.warn('[auth] CSRF state signature invalid — rejecting callback');
    return res.status(403).send('Invalid state parameter. Please try logging in again.');
  }

  // ── Validate mobile redirect against allowlist ─────────────────────────────
  const mobileRedirect = mobileRedirectRaw && isAllowedMobileRedirect(mobileRedirectRaw)
    ? mobileRedirectRaw
    : null;

  if (mobileRedirectRaw && !mobileRedirect) {
    console.warn(`[auth] Blocked disallowed mobile redirect: ${mobileRedirectRaw}`);
    return res.status(400).send('Invalid redirect URI');
  }

  // ── Exchange code for tokens ───────────────────────────────────────────────
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (tokens.error) return res.status(400).send(tokens.error);

  // ── Get user profile ───────────────────────────────────────────────────────
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileRes.json() as { email: string };

  const refresh = tokens.refresh_token ?? '';

  // ── Store tokens server-side ────────────────────────────────────────────────
  // Google tokens never leave the server from here on. `prompt: consent` (set
  // in google.ts) means Google always issues a refresh_token, even on reconnect.
  await upsertUser({
    email: profile.email,
    googleAccessToken: tokens.access_token,
    googleRefreshToken: refresh || undefined,
    tokenExpiresAt: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : undefined,
  });

  // ── Redirect back to the app ───────────────────────────────────────────────
  // Mobile now gets the same server-issued session token as the web client —
  // Google tokens stay server-side (already upserted into Supabase above) and
  // never travel over the deep link. The custom scheme redirect (unlike the
  // web flow's URL) never ends up in browser history, so this is still safe
  // to send directly rather than going through the encrypted-code handoff.
  if (mobileRedirect) {
    const sessionToken = createSessionToken(profile.email);
    const separator = mobileRedirect.includes('?') ? '&' : '?';
    return res.redirect(
      `${mobileRedirect}${separator}token=${encodeURIComponent(sessionToken)}&email=${encodeURIComponent(profile.email)}`
    );
  }

  // ── Web flow: encrypt a session identifier (the email) into a one-time code ─
  // Google tokens never appear in the URL. The frontend POSTs the code to
  // /api/auth/exchange, which returns a session token — not Google tokens.
  const encryptedCode = encryptAuthCode(profile.email);

  res.redirect(`${FRONTEND_URL}/auth/callback?code=${encodeURIComponent(encryptedCode)}`);
}