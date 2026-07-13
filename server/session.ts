import crypto from 'node:crypto';

// Shared AES-256-GCM helpers for two distinct short-lived/long-lived tokens:
//  - "auth code": the ?code= param handed from callback.ts to exchange.ts (60s TTL)
//  - "session token": what the client holds instead of Google tokens (long TTL)
// Same key, same envelope format as the original callback.ts token encryption:
// iv(hex) . authTag(hex) . ciphertext(hex)
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY!;

interface Envelope {
  expiresAt: number;
  [key: string]: unknown;
}

function encrypt(payload: Record<string, unknown>, ttlMs: number): string {
  const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const plaintext = JSON.stringify({ ...payload, expiresAt: Date.now() + ttlMs } satisfies Envelope);

  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}.${authTag.toString('hex')}.${encrypted.toString('hex')}`;
}

function decrypt<T extends Envelope>(token: string): T | null {
  try {
    const [ivHex, authTagHex, ciphertextHex] = token.split('.');
    if (!ivHex || !authTagHex || !ciphertextHex) return null;

    const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    const parsed = JSON.parse(decrypted.toString('utf8')) as T;
    if (Date.now() > parsed.expiresAt) return null;
    return parsed;
  } catch {
    // Decryption failed — token is invalid, tampered with, or malformed
    return null;
  }
}

// ─── Auth code (callback.ts → exchange.ts handoff) ──────────────────────────
// Carries only the user's email — never Google tokens. 60s TTL, same as before.

export function encryptAuthCode(email: string): string {
  return encrypt({ email }, 60_000);
}

export function decryptAuthCode(code: string): { email: string } | null {
  return decrypt<Envelope & { email: string }>(code);
}

// ─── Session token (what the client holds instead of Google tokens) ────────
// Google's refresh token effectively never expires unless revoked, so this
// TTL just bounds how long a session survives without the user re-consenting.

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function createSessionToken(email: string): string {
  return encrypt({ email }, SESSION_TTL_MS);
}

export function verifySessionToken(token: string): { email: string } | null {
  return decrypt<Envelope & { email: string }>(token);
}
