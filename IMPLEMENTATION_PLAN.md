# TicketVault — Implementation Plan

This document contains prioritized implementation specs for the remaining
architectural work. Each section is self-contained and can be handed to
Claude Code as a task. Work through them in order — later items depend on
earlier ones.

Read `CLAUDE.md` first for full project context.

---

## Phase 1: Before Letting Anyone Else Use It

### 1.1 — Server-Side Database (Supabase)

**Why:** The app has zero server-side persistence. Tokens live in the
browser, tickets are re-parsed from Gmail on every sync, and there's no
user model. This blocks everything else.

**Choice:** Supabase (free tier: 500MB database, 1GB storage, 50k monthly
active users). It's Postgres under the hood, has a JS client, and works
well with Vercel serverless functions.

**Setup steps:**
1. Create a Supabase project at https://supabase.com
2. Add these env vars to Vercel:
   - `SUPABASE_URL` — project URL from Supabase dashboard
   - `SUPABASE_SERVICE_KEY` — service role key (server-side only, never client)

**Schema (run in Supabase SQL editor):**

```sql
-- Users: one row per Google account connected
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  google_access_token text,
  google_refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz default now(),
  last_sync_at timestamptz
);

-- Cached parsed tickets: avoid re-parsing Gmail on every sync
create table tickets (
  id text primary key,                    -- platform + order hash
  user_id uuid references users(id) on delete cascade,
  platform text not null,
  event_name text not null,
  venue text default '',
  city text default '',
  date text not null,                     -- YYYY-MM-DD
  time text default '8:00 PM',
  section text,
  row text,
  seat text,
  quantity integer default 1,
  order_number text default '',
  gmail_message_id text not null,         -- enables incremental sync
  parsed_at timestamptz default now(),
  unique(user_id, gmail_message_id)       -- prevent duplicate inserts
);

-- Index for fast per-user ticket lookups
create index idx_tickets_user on tickets(user_id);

-- Row-level security: users can only see their own tickets
alter table users enable row level security;
alter table tickets enable row level security;
```

**New file: `server/db.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export { supabase };
```

**Package to install:** `npm install @supabase/supabase-js`

**Files to modify:**
- `api/auth/callback.ts` — After getting tokens from Google, upsert a
  user row in Supabase. Store tokens server-side. The encrypted code sent
  to the frontend should contain a session token (not Google tokens).
- `api/auth/exchange.ts` — Return a session token that maps to the
  Supabase user, not the raw Google tokens.
- `api/tickets.ts` — Accept session token, look up Google tokens from
  Supabase, check cached tickets, only call Gmail if stale.
- `api/auth/refresh.ts` — Look up refresh token from Supabase by user,
  not from the client request body.

**Key principle:** After this change, Google tokens never leave the server.
The client only holds a session token.

---

### 1.2 — Incremental Sync

**Why:** Every sync currently makes 500+ Gmail API calls. With cached
tickets in Supabase, returning users should sync in under a second.

**How it works:**
1. `api/tickets.ts` receives a sync request
2. Look up the user's `last_sync_at` from Supabase
3. If `last_sync_at` is within the last 5 minutes, return cached tickets
   from the `tickets` table immediately (no Gmail calls)
4. Otherwise, query Gmail with `after:YYYY/MM/DD` (date of last sync)
   for each platform — this returns only new emails
5. Parse only the new emails
6. Upsert new tickets into Supabase (using gmail_message_id as dedup key)
7. Update `last_sync_at` on the user
8. Return full ticket list from Supabase

**Gmail query modification in `gmailParser.ts`:**

The `PLATFORM_QUERIES` object builds Gmail search strings. Add an
optional `afterDate` parameter:

```typescript
export async function fetchTicketsFromGmail(
  accessToken: string,
  afterDate?: string  // YYYY/MM/DD format for Gmail search
): Promise<ParsedTicket[]> {
  // ... in the Gmail query construction:
  const afterFilter = afterDate ? ` after:${afterDate}` : '';
  const query = `${platformQuery}${afterFilter}`;
  // ...
}
```

**Files to modify:**
- `server/gmailParser.ts` — Add optional `afterDate` param
- `api/tickets.ts` — Check cache freshness, do incremental or full sync
- `server/db.ts` — Add ticket CRUD helpers

---

### 1.3 — Privacy Policy & Terms of Service

**Why:** Required by Google OAuth verification. Without it, you can't get
your app approved for public use.

**What to create:**
- `public/privacy.html` — Plain English privacy policy covering:
  - What data is accessed (email subjects/bodies from ticket platforms only)
  - How it's processed (parsed server-side, not stored permanently*)
  - What's stored (user email, parsed ticket data, encrypted tokens)
  - No data sold or shared with third parties
  - How to delete your data (sign out, or email a request)
  - Contact info
  *Update this once you add Supabase — tickets ARE stored then

- `public/terms.html` — Basic terms of service:
  - Service provided as-is
  - User is responsible for their account
  - You can terminate accounts
  - Limitation of liability

**Vercel routing:** Add to `vercel.json` rewrites so `/privacy` and
`/terms` serve these pages (or just link to them as static files).

**Google OAuth verification:**
1. Go to Google Cloud Console → APIs & Services → OAuth consent screen
2. Switch from "Testing" to "Production"
3. Fill in the required fields (app name, support email, privacy policy URL)
4. Submit for verification — Google reviews manually, takes 2-6 weeks
5. You'll need to demonstrate why you need `gmail.readonly` scope

---

## Phase 2: Before It Feels Like a Real App

### 2.1 — Per-Account Management

**Why:** Users can connect multiple Gmail accounts but can't disconnect
one without signing out entirely. No sync status visibility.

**UI changes to `Header.tsx`:**
- Each account pill gets a small X button to disconnect that account
- Each pill shows a subtle sync indicator (green dot = synced recently,
  yellow = syncing, red = failed)
- Clicking a pill shows last sync time in a tooltip

**State changes to `App.tsx`:**
- Add `removeAccount(email: string)` function that:
  1. Revokes the Google token for that account
  2. Removes the account from state and localStorage
  3. Clears cached tickets for that account
  4. If Supabase is set up, deletes the user row (cascades to tickets)

**Auth changes to `auth.ts`:**
- Add `removeAccount(email: string)` export
- Add `getAccountSyncStatus(email: string): 'fresh' | 'stale' | 'error'`

**Handling revoked tokens:**
- When `fetchTicketsForAccount` gets a 401 AND refresh fails, mark the
  account as `needsReconnect: true` instead of silently failing
- Show a "Reconnect" button on the account pill instead of the X
- Clicking "Reconnect" calls `startGoogleAuth()` — the callback handler
  already updates tokens for existing accounts

---

### 2.2 — Data Validation with Zod

**Why:** The API returns untyped JSON that's pushed directly into typed
arrays. A parser bug could crash the UI.

**Package to install:** `npm install zod`

**New file: `src/lib/validators.ts`**

```typescript
import { z } from 'zod';

export const ParsedTicketSchema = z.object({
  id: z.string(),
  platform: z.enum([
    'ticketmaster', 'axs', 'dice', 'stubhub',
    'tickpick', 'eventbrite', 'seatgeek'
  ]),
  eventName: z.string(),
  venue: z.string(),
  city: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string(),
  quantity: z.number().int().positive(),
  orderNumber: z.string(),
  confirmationEmailId: z.string(),
  section: z.string().optional(),
  row: z.string().optional(),
  seat: z.string().optional(),
  imageUrl: z.string().optional(),
  barcode: z.string().optional(),
});

export const TicketResponseSchema = z.array(ParsedTicketSchema);
```

**Files to modify:**
- `src/lib/auth.ts` — In `fetchTicketsForAccount`, validate the response:
  ```typescript
  const raw = await res.json();
  const result = TicketResponseSchema.safeParse(raw);
  if (!result.success) {
    console.error('Invalid ticket data:', result.error);
    return []; // or throw
  }
  return result.data;
  ```
- `src/lib/validators.ts` — New file with schemas

---

### 2.3 — Error Tracking (Sentry)

**Why:** No visibility into production errors. Parser failures are silent.

**Package to install:** `npm install @sentry/react @sentry/vercel`

**Setup:**
1. Create a Sentry project at https://sentry.io (free tier: 5k events/mo)
2. Add `SENTRY_DSN` env var to Vercel

**Files to modify:**
- `src/main.tsx` — Initialize Sentry before React renders:
  ```typescript
  import * as Sentry from '@sentry/react';
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN });
  ```
- `server/gmailParser.ts` — Wrap each parser in try/catch that reports
  to Sentry instead of silently continuing
- `api/tickets.ts` — Report errors to Sentry before returning 500
- `vite.config.ts` — Add Sentry Vite plugin for source maps

---

### 2.4 — Clean Up Console Logging

**Why:** 30+ log lines per sync. Real errors invisible in the noise.

**Approach:** Replace all `console.log` calls in `gmailParser.ts` with a
simple log-level function:

```typescript
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level: keyof typeof LEVELS, ...args: unknown[]) {
  if (LEVELS[level] >= LEVELS[LOG_LEVEL as keyof typeof LEVELS]) {
    console[level]('[gmailParser]', ...args);
  }
}
```

Then replace:
- `console.log('Searching ...')` → `log('debug', 'Searching ...')`
- `console.log('Found N emails')` → `log('debug', 'Found N emails')`
- `console.warn(...)` → `log('warn', ...)`
- `console.error(...)` → `log('error', ...)`

Set `LOG_LEVEL=warn` in Vercel env vars for production.
Set `LOG_LEVEL=debug` locally for development.

---

## Phase 3: Before Scaling

### 3.1 — Rate Limiting

**Why:** No rate limiting on API routes. A bad actor could drain your
Gmail API quota.

**Approach:** Use Vercel's built-in rate limiting via `vercel.json`, or
add Upstash Redis rate limiting (free tier: 10k commands/day).

**Simple approach without infrastructure** — token bucket in memory:

**New file: `api/middleware/rateLimit.ts`**

```typescript
// Simple in-memory rate limiter. Resets when the function cold-starts,
// which is fine — it's per-instance, not global. For global rate limiting,
// use Upstash Redis.
const requests = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests = 20,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const entry = requests.get(key);
  if (!entry || now > entry.resetAt) {
    requests.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}
```

**Files to modify:**
- `api/tickets.ts` — Add rate limit check using the access token hash
  as the key. Return 429 if exceeded.
- `api/auth/exchange.ts` — Rate limit by IP to prevent brute-forcing
  encrypted codes.

---

### 3.2 — Mobile App Parity

**Why:** The React Native app still uses the old Ticket type, old auth
flow, and has no caching.

**Files to update in ~/Desktop/TicketVaultApp:**

- `lib/types.ts` — Update to match the new ParsedTicket/DisplayTicket
  split. Add a `toDisplayTicket()` function (same logic as web).

- `screens/TicketsScreen.tsx` — Add local caching with AsyncStorage:
  ```typescript
  import AsyncStorage from '@react-native-async-storage/async-storage';
  // Load cached tickets on mount, sync in background
  ```

- `screens/LoginScreen.tsx` — Store refresh token in SecureStore (it
  already does this). Add auto-refresh on 401 (same pattern as web
  auth.ts).

- `lib/types.ts` — Add the dedup/sort logic (same as web App.tsx
  `dedupAndSort` function).

**Package to install (in TicketVaultApp):**
`npx expo install @react-native-async-storage/async-storage`

---

### 3.3 — Queue System for Heavy Syncs

**Why:** The 30-second Vercel function timeout can be hit for users with
many ticket emails. Full syncs for heavy Gmail accounts may time out.

**Approach:** Split sync into two phases:

1. **Fast path** (`api/tickets.ts`): Return cached tickets immediately.
   If cache is stale, trigger a background sync and return cached data
   with a `syncing: true` flag.

2. **Background sync** (`api/sync.ts`): A separate endpoint that does
   the Gmail parsing. Called by the client after getting cached results.
   Can run for the full 30s without blocking the UI.

**Client flow:**
```
GET /api/tickets → { tickets: [...], syncing: true }
  ↓ (show tickets immediately)
GET /api/sync → { tickets: [...], syncing: false }
  ↓ (update with fresh data)
```

**Alternative:** Use Vercel Cron to sync all users' tickets every 15
minutes in the background, so the API always returns fresh cached data.

---

## Summary: Recommended Order

| Priority | Task | Effort | Depends on |
|----------|------|--------|------------|
| 1 | Supabase setup + server-side tokens | 1-2 days | Nothing |
| 2 | Incremental sync | Half day | Supabase |
| 3 | Privacy policy + terms | Half day | Nothing |
| 4 | Google OAuth verification | 30 min + wait | Privacy policy |
| 5 | Per-account management | Half day | Nothing |
| 6 | Zod validation | 1-2 hours | Nothing |
| 7 | Console log cleanup | 30 min | Nothing |
| 8 | Error tracking (Sentry) | 1 hour | Nothing |
| 9 | Rate limiting | 1-2 hours | Nothing |
| 10 | Mobile app parity | 1-2 days | Supabase |
| 11 | Queue system | Half day | Supabase |

Items 6, 7, 8, and 9 are quick wins that can be done any time.
Items 1-4 are the critical path to letting other people use the app.
