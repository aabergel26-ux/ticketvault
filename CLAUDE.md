# TicketVault — Project Context

## What is this?
A React/Vite web app + React Native iOS app that connects to Gmail via OAuth and surfaces ticket confirmations from Ticketmaster, AXS, DICE, and StubHub in a unified dashboard.

## Key URLs
- **Web app (live):** https://ticketvault-eight.vercel.app
- **GitHub:** https://github.com/aabergel26-ux/ticketvault
- **Native app:** `mobile/` (Expo Go / React Native), in this repo

## Architecture
- **Frontend:** React + Vite + TypeScript + Tailwind CSS v3
- **API:** Vercel serverless functions in `api/`
- **Email parsing:** `server/gmailParser.ts` (compiled to `server/gmailParser.js` before deploy)
- **Persistence:** Supabase (Postgres) — `server/db.ts`. Users and their parsed tickets are stored server-side; Google tokens never reach the client.
- **Auth:** Google OAuth 2.0, Gmail readonly scope, encrypted code exchange → opaque server-issued session token (`server/session.ts`)
- **Error tracking:** Sentry (`@sentry/react`), initialized in `src/main.tsx`, wraps `<App />` in an error boundary
- **Deploy:** `npx vercel --prod` (always run `npx tsc -p tsconfig.server.json` first to compile parser)
- **Tests:** `npx tsx --test gmailParser.test.ts` (Node built-in test runner, 52 tests). Note: the test file lives at repo root, not `server/`.

## Critical Deploy Rule
ALWAYS run `npx tsc -p tsconfig.server.json` before `npx vercel --prod`.
Vercel build cache will reuse stale compiled JS otherwise.

## Node Version
Requires **Node 22 LTS** (v22.x). Managed via nvm. Node 19 and earlier will fail.

## Environment Variables (Vercel)
- `GOOGLE_CLIENT_ID` — Google OAuth web client ID
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret
- `REDIRECT_URI` — OAuth callback URL
- `FRONTEND_URL` — Web app URL (https://ticketvault-eight.vercel.app)
- `TOKEN_ENCRYPTION_KEY` — 64-char hex string for AES-256-GCM encryption, shared by the auth-code handoff and the long-lived session token (`server/session.ts`)
  Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Supabase service role key (server-side only, never sent to the client)
- `LOG_LEVEL` — optional, controls `server/gmailParser.ts` log verbosity (`debug`/`info`/`warn`/`error`, default `info`). Set to `warn` in production, `debug` locally.
- `VITE_SENTRY_DSN` — Sentry DSN for error tracking (client-side, `src/main.tsx`). Currently blank/unset — no Sentry project created yet.

---

## Data Architecture (Revised July 2026)

### Type system — separated concerns
The `Ticket` type was split into two layers:

- **`ParsedTicket`** — Pure data from email parsing. What the server returns. No display state, no navigation URLs. Safe to cache because it never changes. Fields: id, platform, eventName, venue, city, date, time, section, row, seat, quantity, orderNumber, confirmationEmailId.

- **`DisplayTicket`** — Client-side view model computed at render time. Extends ParsedTicket with `status` (upcoming/past, based on today's date), `deepLink` (from platform config), and `webFallback`. Never stored or cached.

- **`Ticket`** — Backward-compat alias for `DisplayTicket`. Existing components import `Ticket` and work unchanged.

The server (`gmailParser.ts`) returns `ParsedTicket[]`. The client converts to `DisplayTicket[]` via `toDisplayTicket()` in `platforms.ts`.

### Dedup logic — single source of truth on the client
- Server deduplicates within a single account: same eventName|date keeps higher-priority platform, MAX quantity (not SUM)
- Client re-deduplicates across accounts using `normalizeName()` which strips "& Guests", parentheticals, and non-alphanumeric chars
- Platform priority: DICE(5) > AXS(4) > Ticketmaster(3) > TickPick(2) > StubHub(1)
- Critical fix applied: quantity uses MAX across platforms (not SUM), because StubHub + DICE emails describe the same physical tickets

### Caching
- Two layers now: Supabase (`tickets` table, server-side, keyed by `user_id` + `gmail_message_id`) and `ParsedTicket[]` cached per-account email in the browser's localStorage
- On app load: cached tickets render instantly (no skeleton), then background sync fetches fresh data
- Cache populated automatically after every successful sync
- Cache cleared on sign-out (all accounts) or on disconnecting a single account (`removeAccount()` in `auth.ts` clears just that account's entry)
- If a fetch fails for one account (network error or unrefreshable token), that account's cached tickets are kept in the merged/displayed list rather than dropped — see "Per-account management" below

### Sort order
- Upcoming: soonest first (date ascending)
- Past: most recent first (date descending)
- Tiebreaker: time of day (parsed to minutes)
- Uses date-only string comparison (YYYY-MM-DD) to avoid timezone issues

---

## Security Architecture (Revised July 2026 — now with server-side sessions)

### OAuth flow — Google tokens never leave the server
Tokens never appear in URLs, and as of the Supabase migration, Google access/refresh tokens never reach the client at all — the client only ever holds an opaque server-issued session token. The flow:
1. `google.ts` generates a random nonce, signs it with `TOKEN_ENCRYPTION_KEY` (HMAC-SHA256) via `signState()` (`server/session.ts`), and passes `nonce.signature` to Google as the `state` param — no cookie is set; a cookie set here doesn't reliably survive the round trip to Google on Vercel
2. Google redirects back to `callback.ts` with an authorization code
3. `callback.ts` recomputes the signature over the nonce and compares it to the one in `state` via `verifyState()` (constant-time comparison) — no server-side nonce storage to check against — then exchanges the code for tokens with Google and **upserts a user row in Supabase** (`server/db.ts`) storing the Google access token, refresh token, and expiry
4. `callback.ts` encrypts just the user's **email** (not tokens) into a short-lived AES-256-GCM blob via `encryptAuthCode()` (`server/session.ts`), and redirects to the frontend with `?code=ENCRYPTED_BLOB`
5. Frontend detects the code (`detectAuthCode()`), POSTs it to `exchange.ts`
6. `exchange.ts` decrypts the blob (60s TTL), looks up the user in Supabase, and returns a long-lived **session token** (`createSessionToken()`, 90-day TTL) — never the underlying Google tokens
7. The client stores `{ email, sessionToken }` as its `Account` (see `Account` in `src/lib/auth.ts`) and sends `Authorization: Bearer <sessionToken>` on every `/api/tickets` call

### Mobile OAuth flow
Mobile redirects go to custom app schemes (`exp://`, `ticketvault://`) which don't appear in browser history. `callback.ts` now issues the same server-side session token for mobile as it does for web (`createSessionToken()`), passed directly in the deep link as `?token=SESSION_TOKEN&email=EMAIL` — Google tokens never leave the server (they're already upserted into Supabase earlier in the handler). Mobile redirects are validated against an allowlist to prevent open redirect attacks.

### Token management
- Google access/refresh tokens live only in Supabase (`users` table), never in the browser
- The client holds a session token (localStorage, in the `Account` object) that maps to a Supabase user row — this is what `signOutAccounts`/`removeAccount` revoke server-side
- No client-side token refresh. `api/tickets.ts` only reads cached tickets straight from Supabase — it never touches Google tokens or calls Gmail. `api/sync.ts` is the endpoint that refreshes the Google access token itself (via `refreshGoogleAccessToken()`) whenever it's missing or within 60s of expiring, and persists the refreshed token back to Supabase before calling Gmail
- If refresh fails (revoked grant) or the session token is invalid/expired, `api/sync.ts` returns 401 (`api/tickets.ts` only 401s on an invalid/expired session token or missing user, since it has no Google token to refresh). The client's `fetchTicketsForAccount()` throws a `ReconnectRequiredError` on a 401 from either endpoint, which `App.tsx` uses to flag that account as needing reconnection — see "Per-account management" below
- Sign-out (`/api/auth/signout`, POST-only) revokes the Google grant via `https://oauth2.googleapis.com/revoke` using whichever token is on file, then deletes the Supabase user row (cascades to their cached tickets)
- `refresh.ts` still exists and is POST-only, but neither the web client nor the mobile app calls it anymore now that mobile also uses session tokens

### Rate limiting
- `server/rateLimit.ts` — simple in-memory token-bucket, per Vercel function instance (resets on cold start; not a global limit)
- Applied in `api/tickets.ts` and `api/sync.ts` (both keyed by a SHA-256 hash of the session token, 20 req/min) and `api/auth/exchange.ts` (keyed by client IP, to slow brute-forcing of encrypted codes)

### CORS
- `vercel.json` restricts `Access-Control-Allow-Origin` to the production frontend URL for all `/api/*` routes

### Deep link fallback
- Mobile: tries native scheme, falls back to web URL after 1.5s if the page is still visible (app not installed)
- Desktop: opens web URL directly

### Client-side data validation
- `src/lib/validators.ts` defines a Zod `ParsedTicketSchema`/`TicketResponseSchema`
- `fetchTicketsForAccount()` in `auth.ts` parses every `/api/tickets` response through `TicketResponseSchema.safeParse()` before it touches app state — a malformed response logs an error and returns `[]` instead of crashing the UI

### Per-account management
- Each account pill in `Header.tsx` shows an X button (disconnect) normally, or an amber "Reconnect" button when that account's token can't be refreshed
- Disconnecting calls `removeAccount()` (`auth.ts`): revokes via `/api/auth/signout`, clears that account's ticket cache, and the caller (`App.tsx`'s `handleRemoveAccount`) drops it from `accounts` state/localStorage
- `App.tsx` tracks a separate `needsReconnect: Set<email>` state (deliberately not part of the persisted `Account` object, so updating it doesn't re-trigger the account-list sync effect). A 401 (`ReconnectRequiredError`) adds the email; a subsequent successful fetch removes it
- Clicking "Reconnect" just calls `startGoogleAuth()` again — `callback.ts` already upserts onto the existing Supabase user row by email, so re-consenting refreshes that account's stored tokens in place

### Error tracking
- `@sentry/react`, initialized in `src/main.tsx` with `dsn: import.meta.env.VITE_SENTRY_DSN`
- `<App />` is wrapped in `Sentry.ErrorBoundary` with a styled fallback UI (dark-mode aware) and a "Try again" reset button
- No Sentry project exists yet — `VITE_SENTRY_DSN` is blank in `.env`; the SDK no-ops until it's set
- Deliberately not using `@sentry/vercel` yet (no source maps wired up) — see Pending Work

---

## Gmail Parsing Platforms
Active: ticketmaster, axs, dice, stubhub
Removed from UI: tickpick (still parsed server-side)
Not yet built: eventbrite, seatgeek

## Known Ticket List (ground truth from PDFs)
### Upcoming
1. Chris Lake — Jun 6, 2026 (AXS) — Under the K Bridge Park

### Past (most recent first)
2. Wakyin — Jan 31, 2026 (StubHub) — Knockdown Center, Maspeth
3. RÜFÜS DU SOL — Jul 25, 2025 (Ticketmaster) — Red Bull Arena, Harrison NJ
4. Framework / Keinemusik LA — May 4, 2024 (DICE) — Venue TBA, LA
5. Underrated x Safra: Alex Wann — Apr 4, 2024 (DICE) — Kiss Kiss Bang Bang LA
6. AMÉMÉ — Mar 30, 2024 (DICE) — Sound Nightclub, LA
7. Kölsch, Jeremy Olander — Nov 25, 2023 (DICE) — Sound Nightclub, LA
8. Cristoph (Open to Close) — Nov 18, 2023 (DICE) — Sound Nightclub, LA
9. Tinlicker (DJ Set) — Oct 8, 2023 (DICE) — Sound Nightclub, LA
10. Bonobo presents OUTLIER — Jul 29, 2023 (DICE) — Knockdown Center, NY
11. MAYAN WARRIOR: New York — Jul 8, 2023 (DICE) — Brooklyn Mirage
12. KEINEMUSIK — Jul 1, 2023 (DICE) — Brooklyn Mirage
13. LA Clippers vs. Charlotte Hornets — Dec 21, 2022 (Ticketmaster) — Crypto.com Arena
14. LA Kings vs. Anaheim Ducks — Dec 20, 2022 (Ticketmaster) — Crypto.com Arena
15. Kx5 — Dec 10, 2022 (Ticketmaster) — LA Memorial Coliseum

## Two Gmail Accounts
- aabergel26@gmail.com
- adama142614@gmail.com

---

## Key Parsing Fixes Applied
- **Quantity dedup:** Uses MAX (not SUM) across platforms — StubHub + DICE describe the same physical tickets
- **AXS timezone trap:** `new Date("6/6/2026")` replaced with explicit month/day/year integer parsing to avoid UTC midnight date shifts
- **StubHub venue parsing:** No longer hardcoded to "- Complex" pattern. Added 4 fallback patterns: "at VENUE", "VENUE · City", event-to-date gap matching, and zip code city extraction
- **DICE French full date:** Comma after day number made optional (`?,?`) so "Date samedi 9 mai 2026" parses correctly
- **DICE French month pattern:** Escape dots properly (`\\.` not `\.`) in `new RegExp()` strings
- DICE: handles DAY YEAR MONTH format ("sam. 30 2024 mars"), French no-year fallback uses email received date
- AXS: 2-digit year fix ("12-21-22" → 2022), email received date as fallback
- Ticketmaster: broad "Month DD, YYYY" search as primary date match, email received year for resale emails
- Server dedup key: eventName|date (not just eventName) so same-name events on different dates survive
- AXS: returns null when no event name found (skips "YOUR TICKETS ARE HERE" delivery emails)

## DICE Date Formats
- English standard: "Sat 01 Jul, 7:00 PM"
- English year-mid: "Sat 29 2023 Jul, 10:00 PM" ← DICE quirk
- French standard: "sam. 09 mai, 10:00 PM"
- French year-mid: "sam. 30 2024 mars, 10:00 PM" ← DICE quirk
- French full: "Date samedi 9 mai 2026"

---

## Test Suite
- File: `gmailParser.test.ts` (repo root — moved out of `server/`)
- Runner: `npx tsx --test gmailParser.test.ts`
- 52 tests across 12 suites:
  - `stripHtml` — tag removal, entity decoding, whitespace collapsing
  - `timeToMinutes` — AM/PM edge cases, unparseable fallback
  - `detectPlatform` — all platforms + livenation alias
  - `parseDiceDate` — all 6 known formats
  - `parseDiceTicket` — EN/FR purchases, transfers, skip patterns
  - `parseAxsTicket` — date formats, presale skip, email date fallback
  - `parseTicketmasterTicket` — classic + resale, age qualifier stripping
  - `parseStubhubTicket` — template A, non-order skip
  - `parseTickpickTicket` — purchase confirmation, delivery skip
  - `toDisplayTicket` — status/deepLink/webFallback computed correctly (renamed from `makeTicket` now that display concerns live client-side)
  - Dedup logic — MAX not SUM, platform priority
  - Sort logic — upcoming/past ordering, time-of-day tiebreaking
- Test file has `/* eslint-disable */` and `// @ts-nocheck` at top (editor type-checking disabled; tests run via tsx directly)
- No tests yet for `server/db.ts`, `server/session.ts`, `server/rateLimit.ts`, or `src/lib/validators.ts` — see Pending Work

---

## File Reference

### TypeScript configs
- `tsconfig.json` — root, references app + node + api
- `tsconfig.app.json` — covers `src/`, browser types
- `tsconfig.node.json` — covers `vite.config.ts`
- `tsconfig.server.json` — covers `server/gmailParser.ts`, `server/db.ts`, `server/session.ts`, `server/rateLimit.ts` + `src/types/index.ts`, emits JS
- `api/tsconfig.json` — covers `api/**/*.ts`, Node types, noEmit (editor-only)

### Backend (`api/`)
- `api/auth/google.ts` — starts OAuth, signs a CSRF nonce with `TOKEN_ENCRYPTION_KEY` (`signState()`) and passes `nonce.signature` as `state` to Google — no cookie
- `api/auth/callback.ts` — verifies the CSRF signature (`verifyState()`), exchanges code with Google, **upserts the user + Google tokens into Supabase**, encrypts the user's email into a short-lived code, redirects with `?code=BLOB`
- `api/auth/exchange.ts` — POST endpoint, decrypts the code, rate-limited by IP, looks up the Supabase user, returns a session token + email (never Google tokens)
- `api/auth/signout.ts` — POST endpoint, verifies the session token, revokes the Google grant, deletes the Supabase user row (cascades to tickets). Used for both bulk sign-out and single-account disconnect
- `api/auth/refresh.ts` — POST-only, exchanges refresh token for new access token. No longer called by the web client or the mobile app (both use session tokens now) — currently unused
- `api/tickets.ts` — fast path: verifies session token, reads cached tickets straight from Supabase, returns `{ tickets, syncing }` where `syncing` is true if `last_sync_at` is null or older than 5 min. Never calls Gmail or Google — zero external API calls
- `api/sync.ts` — heavy path (30s timeout): verifies session token, refreshes the Google token if needed, does an incremental Gmail sync (`after:` the last sync date), upserts new tickets into Supabase, updates `last_sync_at`, and returns the full list. Called by the client only when `/api/tickets` reports `syncing: true`
- `api/debug.ts` — diagnostics endpoint

### Server (`server/`)
- `server/gmailParser.ts` — Gmail search + per-platform parsers + dedup/sort (returns ParsedTicket[]); `fetchTicketsFromGmail(accessToken, afterDate?)` takes an optional `YYYY/MM/DD` for incremental sync; internal logging goes through a `LOG_LEVEL`-gated `log()` helper instead of raw `console.*`
- `server/db.ts` — Supabase client + CRUD: `upsertUser`, `getUserByEmail`, `deleteUserByEmail`, `updateLastSyncAt`, `upsertTickets`, `getTicketsByUser`
- `server/session.ts` — AES-256-GCM envelope helpers built on `TOKEN_ENCRYPTION_KEY`: `encryptAuthCode`/`decryptAuthCode` (60s TTL, carries only an email) and `createSessionToken`/`verifySessionToken` (90-day TTL); also `signState`/`verifyState` (HMAC-SHA256 over the OAuth CSRF nonce, no server-side storage needed)
- `server/rateLimit.ts` — in-memory per-instance token bucket, `checkRateLimit(key, maxRequests, windowMs)`
- `server/index.ts` — legacy local-dev Express server (`npm run server`, port 3001). **Stale**: still implements the old direct-token-in-URL-hash OAuth flow, not session tokens/Supabase — see Pending Work

### Frontend (`src/`)
- `src/types/index.ts` — ParsedTicket, DisplayTicket, Ticket (alias), Platform
- `src/main.tsx` — mounts `<App />`, initializes Sentry (`VITE_SENTRY_DSN`), wraps the tree in `Sentry.ErrorBoundary` with a fallback UI
- `src/App.tsx` — main page: cache-first loading, async code exchange, dedup/sort, render grid; tracks `needsReconnect` (accounts whose 401s couldn't be resolved) separately from `accounts` state; `handleRemoveAccount()` disconnects a single account
- `src/lib/auth.ts` — `Account` model (`{ email, sessionToken }`), `detectAuthCode`/`exchangeAuthCode`, `fetchTicketsForAccount` (throws `ReconnectRequiredError` on 401, Zod-validates the response), `signOutAccounts`/`removeAccount`, per-account ticket caching (`clearCachedTicketsForAccount`)
- `src/lib/validators.ts` — Zod `ParsedTicketSchema`/`TicketResponseSchema` used to validate `/api/tickets` responses before they hit app state
- `src/lib/platforms.ts` — platform configs, toDisplayTicket(), openTicket() with deep link fallback
- `src/components/TicketCard.tsx` — one ticket card
- `src/components/FilterBar.tsx` — Upcoming/Past/All + platform filters
- `src/components/Header.tsx` — logo, account pills (X to disconnect, amber "Reconnect" button when a token can't be refreshed), sync, sign-out, dark mode
- `src/components/ConnectGmail.tsx` — onboarding CTA
- `src/components/PlatformBadge.tsx` — colored platform label
- `src/index.css` — Tailwind base with dark mode support (bg-gray-50 dark:bg-gray-950)

### Config
- `vercel.json` — CORS headers, 30s timeout for tickets endpoint, SPA rewrites
- `tailwind.config.js` — darkMode: 'class', brand colors
- `vite.config.ts` — React plugin, host 0.0.0.0

---

## Native App (`mobile/`)
- Rebuilt from scratch at `mobile/` (previously a separate project at `~/Desktop/TicketVaultApp`)
- React Native + Expo (Expo Go compatible)
- Auth: web bridge via deep link (ticketvault-eight.vercel.app/api/auth/google?mobile=1&mobileRedirect=...) — `callback.ts` issues a server-side session token (`createSessionToken()`) for mobile just like it does for web, so the app never handles raw Google tokens
- Mobile redirects validated against allowlist (exp://, ticketvault://)
- Calls the same two-step `/api/tickets` (instant cached) → `/api/sync` (background fresh data) flow as the web app, via `lib/api.ts`'s `fetchTickets()`
- Caching: `lib/cache.ts` (AsyncStorage, mirrors the web app's ticket cache) for tickets, `lib/auth.ts` (expo-secure-store) for the session token + email
- Screens: LoginScreen.tsx, TicketsScreen.tsx, TicketDetailScreen.tsx, SettingsScreen.tsx

## Google Cloud Console
- Project: Ticket Vault Project
- Web OAuth client ID: 79281794256-e08vn90rft08k47dihjqlmt93oqojbq2.apps.googleusercontent.com
- iOS OAuth client ID: 79281794256-qpvofjenjg4p4mnfq6eifrfnom18e6h7.apps.googleusercontent.com
- Test users: aabergel26@gmail.com, adama142614@gmail.com

---

## Pending Work
- [ ] Privacy policy + Terms of Service pages (`public/privacy.html`, `public/terms.html`) — required before Google OAuth production verification
- [ ] Submit for Google OAuth verification (move consent screen from Testing to Production)
- [ ] Create the actual Sentry project and set `VITE_SENTRY_DSN` in Vercel
- [ ] Wire up `@sentry/vercel`/source maps once the Sentry project exists (deliberately skipped for now)
- [ ] Report parser errors to Sentry server-side (`gmailParser.ts`, `api/tickets.ts` currently just `console.error`/`log('error', ...)`)
- [ ] Fix/replace `server/index.ts` — the local-dev Express server still implements the old direct-token OAuth flow (no Supabase, no session tokens), out of sync with `api/*`
- [ ] Sync status indicators on account pills (green/yellow/red dot + last-sync tooltip) — per-account disconnect/reconnect shipped, but the visual sync-status part of the plan didn't
- [ ] Add tests for `server/db.ts`, `server/session.ts`, `server/rateLimit.ts`, `src/lib/validators.ts` (currently only `gmailParser.ts`/`platforms.ts` logic is covered)
- [ ] Rate-limit `api/auth/signout.ts` and `api/auth/refresh.ts` (currently only `api/tickets.ts`, `api/sync.ts`, and `api/auth/exchange.ts` do)
- [ ] Handle Vercel 30s timeout risk for very large/first-time mailboxes (incremental sync now covers *returning* users, but a first full sync can still be big — consider the queue/background-sync approach from the plan)
- [ ] Push notifications for upcoming events
- [ ] TestFlight build (needs Apple Developer account $99/year)
- [ ] Sorting full verification against all 15 tickets
- [ ] Teksupport: Rafael and Adriatique showing as upcoming — are these real new tickets?

## Completed Work (Second July 2026 session — persistence & hardening)
- [x] Added Supabase persistence (`server/db.ts`) — `users` and `tickets` tables, server-side token storage
- [x] Migrated OAuth to server-side sessions — `callback.ts` upserts Supabase users, `exchange.ts` returns a session token instead of Google tokens, `server/session.ts` handles both the short-lived auth-code envelope and the long-lived session token
- [x] Added `api/auth/signout.ts` — revokes the Google grant and deletes the Supabase user row; reused for both bulk sign-out and single-account disconnect
- [x] Removed client-side token refresh — `api/tickets.ts` now refreshes the Google access token server-side and persists it back to Supabase
- [x] Added incremental sync — `fetchTicketsFromGmail()` accepts an optional `afterDate`, `api/tickets.ts` serves straight from Supabase within a 5-minute freshness window and otherwise only re-queries Gmail for messages since the last sync
- [x] Added `server/rateLimit.ts` — in-memory token bucket, applied to `api/tickets.ts` and `api/auth/exchange.ts`
- [x] Added Zod validation (`src/lib/validators.ts`) — `fetchTicketsForAccount()` now validates every `/api/tickets` response before it reaches app state
- [x] Added `LOG_LEVEL` toggle to `gmailParser.ts`, replacing raw `console.log`/`console.warn` calls
- [x] Added per-account disconnect: X button on each pill in `Header.tsx`, `removeAccount()` in `auth.ts`, `handleRemoveAccount()` in `App.tsx`
- [x] Added graceful handling of revoked tokens: `ReconnectRequiredError` on 401, `needsReconnect` state, amber "Reconnect" pill button, failed accounts fall back to cached tickets instead of disappearing
- [x] Added Sentry (`@sentry/react`) — initialized in `main.tsx`, `<App />` wrapped in an error boundary with a styled fallback (DSN not yet provisioned)
- [x] Moved `gmailParser.test.ts` to repo root; suite renamed `makeTicket` → `toDisplayTicket`, now 52 tests
- [x] Rebuilt the native app from scratch at `mobile/` and migrated its OAuth to the session-token flow — `callback.ts`'s mobile-redirect branch now calls `createSessionToken()` instead of handing over the raw Google `access_token`/`refresh` token
- [x] Replaced the OAuth CSRF cookie with a signed state param — `google.ts` no longer sets a `Set-Cookie` (it didn't reliably survive the redirect round-trip to Google on Vercel); `signState()`/`verifyState()` (`server/session.ts`) sign/verify the nonce via HMAC-SHA256 instead, so `state` carries `nonce.signature` directly and `callback.ts` needs no server-side nonce storage to check against
- [x] Split `api/tickets.ts` into a fast Supabase-only read path and a new `api/sync.ts` heavy path that does the actual Google token refresh + Gmail sync (30s timeout); `api/tickets.ts` now makes zero external API calls and reports `{ tickets, syncing }` so the client knows whether to follow up with `/api/sync`

## Completed Work (July 2026 session)
- [x] Split Ticket type into ParsedTicket (server) + DisplayTicket (client)
- [x] Fixed quantity double-counting (MAX not SUM)
- [x] Fixed AXS timezone trap (explicit date parsing)
- [x] Fixed StubHub venue parsing (4 fallback patterns)
- [x] Fixed DICE French full date regex (optional comma)
- [x] Fixed DICE French month pattern escaping
- [x] Added toDisplayTicket() — status/deepLink/webFallback computed at render time
- [x] Added deep link fallback (1.5s timeout before web fallback on mobile)
- [x] Added refresh token flow (auto-retry on 401)
- [x] Added ticket caching in localStorage (instant load, background sync)
- [x] Moved token storage from sessionStorage to localStorage
- [x] Added CSRF protection on OAuth (state param + httpOnly cookie)
- [x] Added open redirect protection (mobile scheme allowlist)
- [x] Made refresh endpoint POST-only
- [x] Added CORS headers in vercel.json
- [x] Implemented encrypted code exchange (tokens never in URLs)
- [x] Added api/auth/exchange.ts endpoint
- [x] Added api/tsconfig.json for Node types
- [x] Fixed index.css dark flash (body matches dark mode toggle)
- [x] Fixed sign-out to revoke Google tokens
- [x] Fixed re-auth to update existing account tokens
- [x] Added 51-test suite for gmailParser
- [x] Upgraded to Node 22 LTS

## User Preferences
- Be systematic, verify code before deploying
- Always compile gmailParser.ts to JS before deploying
- Check TypeScript compiles clean before every deploy
- Brand colors: TM=#026CDF, AXS=#E31837, DICE=#FFD600, StubHub=#770FDF