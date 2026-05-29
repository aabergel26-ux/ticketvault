import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchTicketsFromGmail } from '../server/gmailParser.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
}
