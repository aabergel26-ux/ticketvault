import { z } from 'zod';

export const ParsedTicketSchema = z.object({
  id: z.string(),
  platform: z.enum([
    'ticketmaster', 'axs', 'dice', 'stubhub',
    'tickpick', 'eventbrite', 'seatgeek',
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

export const TicketResponseSchema = z.object({
  tickets: z.array(ParsedTicketSchema),
  syncing: z.boolean(),
});
