import { createClient } from '@supabase/supabase-js';
import type { ParsedTicket } from '../src/types/index.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export { supabase };

// ─── Users ───────────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  google_access_token: string | null;
  google_refresh_token: string | null;
  token_expires_at: string | null;
  created_at: string;
  last_sync_at: string | null;
}

export interface UpsertUserInput {
  email: string;
  googleAccessToken?: string | null;
  googleRefreshToken?: string | null;
  tokenExpiresAt?: string | null;
}

export async function upsertUser(input: UpsertUserInput): Promise<UserRow> {
  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        email: input.email,
        google_access_token: input.googleAccessToken,
        google_refresh_token: input.googleRefreshToken,
        token_expires_at: input.tokenExpiresAt,
      },
      { onConflict: 'email' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select()
    .eq('email', email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateLastSyncAt(userId: string, timestamp = new Date().toISOString()): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ last_sync_at: timestamp })
    .eq('id', userId);

  if (error) throw error;
}

// Deletes the user row (cascades to their tickets via the FK).
export async function deleteUserByEmail(email: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('email', email);

  if (error) throw error;
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

export interface TicketRow {
  id: string;
  user_id: string;
  platform: string;
  event_name: string;
  venue: string;
  city: string;
  date: string;
  time: string;
  section: string | null;
  row: string | null;
  seat: string | null;
  quantity: number;
  order_number: string;
  gmail_message_id: string;
  parsed_at: string;
}

function toTicketRow(userId: string, ticket: ParsedTicket): Omit<TicketRow, 'parsed_at'> {
  return {
    id: ticket.id,
    user_id: userId,
    platform: ticket.platform,
    event_name: ticket.eventName,
    venue: ticket.venue,
    city: ticket.city,
    date: ticket.date,
    time: ticket.time,
    section: ticket.section ?? null,
    row: ticket.row ?? null,
    seat: ticket.seat ?? null,
    quantity: ticket.quantity,
    order_number: ticket.orderNumber,
    gmail_message_id: ticket.confirmationEmailId,
  };
}

function fromTicketRow(row: TicketRow): ParsedTicket {
  return {
    id: row.id,
    platform: row.platform as ParsedTicket['platform'],
    eventName: row.event_name,
    venue: row.venue,
    city: row.city,
    date: row.date,
    time: row.time,
    section: row.section ?? undefined,
    row: row.row ?? undefined,
    seat: row.seat ?? undefined,
    quantity: row.quantity,
    orderNumber: row.order_number,
    confirmationEmailId: row.gmail_message_id,
  };
}

export async function upsertTickets(userId: string, tickets: ParsedTicket[]): Promise<void> {
  if (tickets.length === 0) return;

  const rows = tickets.map((t) => toTicketRow(userId, t));
  const { error } = await supabase
    .from('tickets')
    .upsert(rows, { onConflict: 'user_id,gmail_message_id' });

  if (error) throw error;
}

export async function getTicketsByUser(userId: string): Promise<ParsedTicket[]> {
  const { data, error } = await supabase
    .from('tickets')
    .select()
    .eq('user_id', userId);

  if (error) throw error;
  return (data as TicketRow[]).map(fromTicketRow);
}
