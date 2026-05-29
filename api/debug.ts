import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const accessToken = auth.slice(7);

  const PLATFORM_SENDERS: Record<string, string[]> = {
    ticketmaster: ['ticketmaster.com', 'livenation.com'],
    axs: ['axs.com'],
    dice: ['dice.fm'],
    stubhub: ['stubhub.com'],
    tickpick: ['tickpick.com'],
  };

  const allDomains = Object.values(PLATFORM_SENDERS).flat();
  const fromQuery = encodeURIComponent(allDomains.map((d) => `from:${d}`).join(' OR '));

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${fromQuery}&maxResults=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const list = await listRes.json() as { messages?: Array<{ id: string }>; error?: unknown };

  if (!list.messages?.length) {
    return res.json({ total: 0, emails: [] });
  }

  const emails = await Promise.all(
    list.messages.map(async ({ id }) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msg = await msgRes.json() as { payload?: { headers?: Array<{ name: string; value: string }> } };
      const headers = msg.payload?.headers ?? [];
      const get = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? '';
      const from = get('From');
      const subject = get('Subject');
      const date = get('Date');

      // Detect platform
      let platform = 'unknown';
      for (const [p, domains] of Object.entries(PLATFORM_SENDERS)) {
        if (domains.some((d) => from.toLowerCase().includes(d))) {
          platform = p;
          break;
        }
      }

      return { id, from, subject, date, platform };
    })
  );

  res.json({ total: emails.length, emails });
}
