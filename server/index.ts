import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { fetchTicketsFromGmail } from './gmailParser.js';

const app = express();
const PORT = 3001;

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = process.env.REDIRECT_URI!;
const FRONTEND_URL = process.env.FRONTEND_URL!;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// Step 1: Redirect user to Google consent screen
app.get('/api/auth/google', (_req, res) => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Step 2: Google redirects back here with ?code=...
app.get('/api/auth/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.status(400).send('Missing code');

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

  const tokens = await tokenRes.json() as { access_token: string; error?: string };
  if (tokens.error) return res.status(400).send(tokens.error);

  // Get user email
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileRes.json() as { email: string };

  // Redirect back to frontend with token + email in hash (never in query string)
  res.redirect(
    `${FRONTEND_URL}/auth/callback#access_token=${tokens.access_token}&email=${encodeURIComponent(profile.email)}`
  );
});

// Step 3: Frontend calls this to fetch parsed tickets
app.get('/api/tickets', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const accessToken = auth.slice(7);
  try {
    const tickets = await fetchTicketsFromGmail(accessToken);
    res.json(tickets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Auth server running on http://0.0.0.0:${PORT}`));
