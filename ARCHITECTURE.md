# TicketVault — Architecture

A high-level map of how the whole system fits together. See `CLAUDE.md` for
project context, ground-truth ticket list, and parsing-fix history.

## Two projects

| Project | Folder | What it is |
|---------|--------|-----------|
| **Web app + API** | `~/ticketvault` | The website + the backend that reads Gmail |
| **Native iOS app** | `~/Desktop/TicketVaultApp` | The iPhone app (Expo / React Native) |

## Data flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                            YOUR GMAIL                                 │
│   📧 Ticketmaster   📧 AXS   📧 DICE   📧 StubHub  confirmations      │
└────────────────────────────────┬────────────────────────────────────┘
                                  │  (Google OAuth token)
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND  (~/ticketvault, runs on Vercel)           │
│                                                                       │
│   api/auth/google.ts ──► Google login screen                         │
│   api/auth/callback.ts ◄─ Google returns token                       │
│                                                                       │
│   api/tickets.ts  ◄─────── apps call this with your token            │
│        │                                                              │
│        ▼                                                              │
│   server/gmailParser.ts   ⭐ THE BRAIN                                │
│   ┌─────────────────────────────────────────────────┐               │
│   │ 1. search Gmail (one query per platform)         │               │
│   │ 2. extractBody()  → get HTML out of each email   │               │
│   │ 3. stripHtml()    → readable text                │               │
│   │ 4. parseXxxTicket() → regex finds:               │               │
│   │      event · venue · city · date · time ·        │               │
│   │      section · qty · order#                      │               │
│   │ 5. dedup by eventName|date, sum quantities       │               │
│   │ 6. sort (upcoming soonest, past most-recent)     │               │
│   └─────────────────────────────────────────────────┘               │
│        │                                                              │
│        ▼  returns JSON list of tickets                                │
└────────┼──────────────────────────────────────────────────────────┘
         │
         ├──────────────────────────┬──────────────────────────────┐
         ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────────────┐
│   WEBSITE            │   │   iPHONE APP (~/Desktop/TicketVaultApp)│
│   (~/ticketvault/src)│   │                                        │
│                      │   │   LoginScreen ──► TicketsScreen        │
│   App.tsx            │   │                      │                 │
│    └ TicketCard.tsx  │   │      ┌───────────────┼──────────────┐  │
│    └ FilterBar.tsx   │   │      ▼               ▼              ▼  │
│                      │   │  TicketDetail   Settings   notifications│
│                      │   │   (maps,        (toggles)  (reminders) │
│                      │   │    calendar)                           │
└──────────────────────┘   └──────────────────────────────────────┘
```

**One sentence:** Your Gmail token → `api/tickets.ts` → `gmailParser.ts` reads &
parses your emails into clean ticket objects → both the website and the iPhone
app display them.

## Where to make changes

- 🧠 **"A ticket is parsed wrong"** → `server/gmailParser.ts`
  then `npx tsc -p tsconfig.server.json && npx vercel --prod`
- 📱 **"The iPhone app looks/behaves wrong"** → `~/Desktop/TicketVaultApp/screens/`
  then reload in Expo Go
- 🌐 **"The website looks wrong"** → `~/ticketvault/src/` then `npx vercel --prod`

## File reference

### Backend (`~/ticketvault`)
- `server/gmailParser.ts` — Gmail search + per-platform parsers + dedup/sort (the brain)
- `api/tickets.ts` — endpoint the apps call to get tickets
- `api/auth/google.ts` — starts Google login
- `api/auth/callback.ts` — handles Google's response, returns token
- `api/debug.ts` — diagnostics endpoint

### Website (`~/ticketvault/src`)
- `App.tsx` — main page: accounts, fetch, merge/sort, render grid
- `components/TicketCard.tsx` — one ticket card
- `components/FilterBar.tsx` — Upcoming/Past/All + platform filters
- `components/Header.tsx`, `ConnectGmail.tsx`, `PlatformBadge.tsx` — UI pieces
- `lib/auth.ts` — web login + token handling
- `lib/platforms.ts` — platform colors, deep links, Open button logic
- `types/index.ts` — the `Ticket` data shape

### iPhone app (`~/Desktop/TicketVaultApp`)
- `App.tsx` — navigation (defines the 4 screens)
- `screens/LoginScreen.tsx` — Connect Gmail
- `screens/TicketsScreen.tsx` — main screen: header, account pills, filters, cards, sync, toast
- `screens/TicketDetailScreen.tsx` — full-screen detail (tap a card)
- `screens/SettingsScreen.tsx` — notification toggles
- `lib/types.ts` — shared Ticket shape + platform constants + date formatters
- `lib/notifications.ts` — schedule reminders, fire new-ticket alerts
- `lib/preferences.ts` — save/load notification settings
- `lib/actions.ts` — Open in Maps + Add to Calendar
```
