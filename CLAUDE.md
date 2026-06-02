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
- **Auth:** Google OAuth 2.0, Gmail readonly scope
- **Deploy:** `npx vercel --prod` (always run `npx tsc -p tsconfig.server.json` first to compile parser)

## Critical Deploy Rule
ALWAYS run `npx tsc -p tsconfig.server.json` before `npx vercel --prod`.
Vercel build cache will reuse stale compiled JS otherwise.

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

## Sort Order Logic
- Upcoming: soonest first (date ascending)
- Past: most recent first (date descending)
- Tiebreaker: time of day
- Server sorts per-account, client re-sorts after merge
- Both use date-only string comparison (YYYY-MM-DD) to avoid timezone issues

## Key Parsing Fixes Applied
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

## Native App (~/Desktop/TicketVaultApp)
- React Native + Expo SDK 54 (Expo Go compatible)
- Auth: web bridge via deep link (ticketvault-delta.vercel.app/api/auth/google?mobile=1&mobileRedirect=...)
- Calls same Vercel API endpoints as web app
- Screens: LoginScreen.tsx, TicketsScreen.tsx

## OAuth Mobile Flow
1. App calls Linking.createURL('auth') to get its Expo Go redirect URI
2. Opens web app OAuth URL with mobileRedirect param
3. Web callback redirects to the Expo Go URI with token + email
4. App catches deep link, saves to SecureStore, navigates to Tickets

## Google Cloud Console
- Project: Ticket Vault Project
- Web OAuth client ID: 79281794256-e08vn90rft08k47dihjqlmt93oqojbq2.apps.googleusercontent.com
- iOS OAuth client ID: 79281794256-qpvofjenjg4p4mnfq6eifrfnom18e6h7.apps.googleusercontent.com
- Test users: aabergel26@gmail.com, adama142614@gmail.com

## Pending Work
- [ ] Verify venue parsing fix works (just deployed)
- [ ] Verify order number no longer shows as hash
- [ ] Push notifications for upcoming events
- [ ] Multiple account management (remove individual accounts)
- [ ] TestFlight build (needs Apple Developer account $99/year)
- [ ] Sorting still needs full verification against all 15 tickets
- [ ] Teksupport: Rafael and Adriatique showing as upcoming — are these real new tickets?

## User Preferences
- Be systematic, verify code before deploying
- Always compile gmailParser.ts to JS before deploying
- Check TypeScript compiles clean before every deploy
- Brand colors: TM=#026CDF, AXS=#E31837, DICE=#FFD600, StubHub=#770FDF
