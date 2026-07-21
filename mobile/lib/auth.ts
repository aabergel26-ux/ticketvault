import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';

const EMAIL_KEY = 'tv_email';
const SESSION_TOKEN_KEY = 'tv_session_token';

export interface Session {
  email: string;
  sessionToken: string;
}

// ─── Session persistence (expo-secure-store) ────────────────────────────────

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(EMAIL_KEY, session.email);
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, session.sessionToken);
}

export async function loadSession(): Promise<Session | null> {
  const [email, sessionToken] = await Promise.all([
    SecureStore.getItemAsync(EMAIL_KEY),
    SecureStore.getItemAsync(SESSION_TOKEN_KEY),
  ]);
  if (!email || !sessionToken) return null;
  return { email, sessionToken };
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(EMAIL_KEY),
    SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
  ]);
}

// ─── OAuth deep link ─────────────────────────────────────────────────────────
// Linking.createURL builds an exp:// URI in Expo Go and a ticketvault:// URI
// in a standalone/dev-client build — the backend's mobile redirect allowlist
// (api/auth/callback.ts) accepts both, so this works unmodified in either
// environment.

export function getRedirectUri(): string {
  return Linking.createURL('auth/callback');
}

// Parses the deep link the server redirects back to:
// SCHEME://auth/callback?token=SESSION_TOKEN&email=EMAIL
export function parseAuthCallback(url: string): Session | null {
  const { queryParams } = Linking.parse(url);
  const token = queryParams?.token;
  const email = queryParams?.email;
  if (typeof token !== 'string' || typeof email !== 'string') return null;
  return { sessionToken: token, email };
}
