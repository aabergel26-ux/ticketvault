# TicketVault — Project Context

## What is this?
A React/Vite web app + React Native iOS app that connects to Gmail via OAuth and surfaces ticket confirmations from Ticketmaster, AXS, DICE, and StubHub in a unified dashboard.

## Key URLs
- **Web app (live):** https://ticketvault-delta.vercel.app
- **GitHub:** https://github.com/aabergel26-ux/ticketvault
- **Native app:** ~/Desktop/TicketVaultApp (Expo Go / React Native)

## Architecture
- **Frontend:** React + Vite + TypeScript + Tailwind CSS v3
- **API:** Vercel serverless functions in `api/`
- **Email parsing:** `server/gmailParser.ts` (compiled to `server/gmailParser.js` before deploy)
- **Auth:** Google OAuth 2.0, Gmail readonly scope, encrypted code exchange
- **Deploy:** `npx vercel --prod` (always run `npx tsc -p tsconfig.server.json` first to compile parser)
- **Tests:** `npx tsx --test server/gmailParser.test.ts` (Node built-in test runner, 51 tests)

## Critical Deploy Rule
ALWAYS run `npx tsc -p tsconfig.server.json` before `npx vercel --prod`.
Vercel build cache will reuse stale compiled JS otherwise.

## Node Version
Requires **Node 22 LTS** (v22.x). Managed via nvm. Node 19 and earlier will fail.

## Environment Variables (Vercel)
- `GOOGLE_CLIENT_ID` — Google OAuth web client ID
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret
- `REDIRECT_URI` — OAuth callback URL
- `FRONTEND_URL` — Web app URL (https://ticketvault-delta.vercel.app)
- `TOKEN_ENCRYPTION_KEY` — 64-char hex string for AES-256-GCM token encryption
  Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

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
- `ParsedTicket[]` cached per-account email in localStorage
- On app load: cached tickets render instantly (no skeleton), then background sync fetches fresh data
- Cache populated automatically after every successful sync
- Cache cleared on sign-out

### Sort order
- Upcoming: soonest first (date ascending)
- Past: most recent first (date descending)
- Tiebreaker: time of day (parsed to minutes)
- Uses date-only string comparison (YYYY-MM-DD) to avoid timezone issues

---

## Security Architecture (Revised July 2026)

### OAuth flow — encrypted code exchange
Tokens never appear in URLs. The flow:
1. `google.ts` generates a CSRF nonce, stores it in an httpOnly cookie (5min TTL), passes it to Google as the `state` param
2. Google redirects back to `callback.ts` with an authorization code
3. `callback.ts` verifies the CSRF nonce (constant-time comparison), exchanges the code for tokens with Google, then encrypts `{access_token, refresh_token, email, expiresAt}` into an AES-256-GCM blob using `TOKEN_ENCRYPTION_KEY`
4. Redirects to frontend with `?code=ENCRYPTED_BLOB` (not tokens)
5. Frontend detects the code (`detectAuthCode()`), POSTs it to `exchange.ts`
6. `exchange.ts` decrypts the blob, checks the 60-second expiry, returns tokens in the JSON response body

### Mobile OAuth flow (unchanged)
Mobile redirects go to custom app schemes (`exp://`, `ticketvault://`) which don't appear in browser history, so tokens are passed directly. Mobile redirects are validated against an allowlist to prevent open redirect attacks.

### Token management
- Refresh tokens stored in localStorage alongside access tokens
- `fetchTicketsForAccount()` auto-retries with a fresh token on 401
- Token refreshes persisted back to storage
- Sign-out revokes Google tokens via `https://oauth2.googleapis.com/revoke`
- `refresh.ts` is POST-only (refresh tokens never in query strings)

### CORS
- `vercel.json` restricts `Access-Control-Allow-Origin` to the production frontend URL for all `/api/*` routes

### Deep link fallback
- Mobile: tries native scheme, falls back to web URL after 1.5s if the page is still visible (app not installed)
- Desktop: opens web URL directly

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
- File: `server/gmailParser.test.ts`
- Runner: `npx tsx --test server/gmailParser.test.ts`
- 51 tests across 12 suites:
  - `stripHtml` — tag removal, entity decoding, whitespace collapsing
  - `timeToMinutes` — AM/PM edge cases, unparseable fallback
  - `detectPlatform` — all platforms + livenation alias
  - `parseDiceDate` — all 6 known formats
  - `parseDiceTicket` — EN/FR purchases, transfers, skip patterns
  - `parseAxsTicket` — date formats, presale skip, email date fallback
  - `parseTicketmasterTicket` — classic + resale, age qualifier stripping
  - `parseStubhubTicket` — template A, non-order skip
  - `parseTickpickTicket` — purchase confirmation, delivery skip
  - `makeTicket` — returns ParsedTicket without display concerns
  - Dedup logic — MAX not SUM, platform priority
  - Sort logic — upcoming/past ordering, time-of-day tiebreaking
- Test file has `/* eslint-disable */` and `// @ts-nocheck` at top (editor type-checking disabled; tests run via tsx directly)

---

## File Reference

### TypeScript configs
- `tsconfig.json` — root, references app + node + api
- `tsconfig.app.json` — covers `src/`, browser types
- `tsconfig.node.json` — covers `vite.config.ts`
- `tsconfig.server.json` — covers `server/**/*.ts` + `src/types/index.ts`, emits JS
- `api/tsconfig.json` — covers `api/**/*.ts`, Node types, noEmit (editor-only)

### Backend (`api/`)
- `api/auth/google.ts` — starts OAuth, generates CSRF nonce cookie, passes state to Google
- `api/auth/callback.ts` — verifies CSRF, exchanges code, encrypts tokens, redirects with ?code=BLOB
- `api/auth/exchange.ts` — POST endpoint, decrypts code, checks 60s expiry, returns tokens in body
- `api/auth/refresh.ts` — POST-only, exchanges refresh token for new access token
- `api/tickets.ts` — endpoint apps call to get parsed tickets
- `api/debug.ts` — diagnostics endpoint

### Server (`server/`)
- `server/gmailParser.ts` — Gmail search + per-platform parsers + dedup/sort (returns ParsedTicket[])
- `server/gmailParser.test.ts` — 51 unit tests

### Frontend (`src/`)
- `src/types/index.ts` — ParsedTicket, DisplayTicket, Ticket (alias), Platform
- `src/App.tsx` — main page: cache-first loading, async code exchange, dedup/sort, render grid
- `src/lib/auth.ts` — detectAuthCode, exchangeAuthCode, fetchTicketsForAccount (auto-refresh), ticket caching
- `src/lib/platforms.ts` — platform configs, toDisplayTicket(), openTicket() with deep link fallback
- `src/components/TicketCard.tsx` — one ticket card
- `src/components/FilterBar.tsx` — Upcoming/Past/All + platform filters
- `src/components/Header.tsx` — logo, account pills, sync, sign-out, dark mode
- `src/components/ConnectGmail.tsx` — onboarding CTA
- `src/components/PlatformBadge.tsx` — colored platform label
- `src/index.css` — Tailwind base with dark mode support (bg-gray-50 dark:bg-gray-950)

### Config
- `vercel.json` — CORS headers, 30s timeout for tickets endpoint, SPA rewrites
- `tailwind.config.js` — darkMode: 'class', brand colors
- `vite.config.ts` — React plugin, host 0.0.0.0

---

## Native App (~/Desktop/TicketVaultApp)
- React Native + Expo SDK 54 (Expo Go compatible)
- Auth: web bridge via deep link (ticketvault-delta.vercel.app/api/auth/google?mobile=1&mobileRedirect=...)
- Mobile redirects validated against allowlist (exp://, ticketvault://)
- Calls same Vercel API endpoints as web app
- Screens: LoginScreen.tsx, TicketsScreen.tsx, TicketDetailScreen.tsx, SettingsScreen.tsx

## Google Cloud Console
- Project: Ticket Vault Project
- Web OAuth client ID: 79281794256-e08vn90rft08k47dihjqlmt93oqojbq2.apps.googleusercontent.com
- iOS OAuth client ID: 79281794256-qpvofjenjg4p4mnfq6eifrfnom18e6h7.apps.googleusercontent.com
- Test users: aabergel26@gmail.com, adama142614@gmail.com

---

## Pending Work
- [ ] Set up TOKEN_ENCRYPTION_KEY env var in Vercel and deploy
- [ ] Verify encrypted code exchange flow works end-to-end
- [ ] Clean up console.log noise in gmailParser.ts (add LOG_LEVEL toggle)
- [ ] Handle Vercel 30s timeout risk (pagination or background processing for large mailboxes)
- [ ] Push notifications for upcoming events
- [ ] Multiple account management (remove individual accounts)
- [ ] TestFlight build (needs Apple Developer account $99/year)
- [ ] Sorting full verification against all 15 tickets
- [ ] Teksupport: Rafael and Adriatique showing as upcoming — are these real new tickets?

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