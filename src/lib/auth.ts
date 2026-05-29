// In production (Vercel), API routes are relative. In local dev, proxy to Express server.
const IS_DEV = import.meta.env.DEV;
const SERVER = IS_DEV ? (import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001') : '';

export interface Account {
  accessToken: string;
  email: string;
}

export function startGoogleAuth() {
  window.location.href = `${SERVER}/api/auth/google`;
}

export function parseAuthCallback(): { accessToken: string; email: string } | null {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const email = params.get('email');
  if (!accessToken || !email) return null;
  history.replaceState(null, '', window.location.pathname);
  return { accessToken, email: decodeURIComponent(email) };
}

export function loadAccounts(): Account[] {
  try {
    return JSON.parse(sessionStorage.getItem('tv_accounts') ?? '[]');
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: Account[]) {
  sessionStorage.setItem('tv_accounts', JSON.stringify(accounts));
}

export async function fetchTicketsForAccount(account: Account) {
  const res = await fetch(`${SERVER}/api/tickets`, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch tickets for ${account.email}`);
  return res.json();
}
