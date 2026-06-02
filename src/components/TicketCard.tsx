import { Calendar, MapPin, Ticket as TicketIcon, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Ticket } from '../types';
import { PLATFORMS, openTicket } from '../lib/platforms';
import { PlatformBadge } from './PlatformBadge';

interface Props {
  ticket: Ticket;
}

export function TicketCard({ ticket }: Props) {
  const config = PLATFORMS[ticket.platform];
  const eventDate = parseISO(ticket.date);
  const past = ticket.status === 'past';

  return (
    <article
      className={`relative flex flex-col gap-4 rounded-2xl border p-5 transition-shadow hover:shadow-lg
        ${past
          ? 'border-gray-200 bg-white opacity-50 dark:border-gray-700 dark:bg-gray-900/50'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-500'
        }`}
    >
      {/* Header row: badge + past tag */}
      <div className="flex items-start justify-between gap-3">
        <PlatformBadge platform={ticket.platform} />
        {past && (
          <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            Past
          </span>
        )}
      </div>

      {/* Event name */}
      <h2 className="text-base font-bold leading-snug text-gray-900 dark:text-white">
        {ticket.eventName}
      </h2>

      {/* Details */}
      <div className="flex flex-col gap-2 text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <Calendar size={14} className={`shrink-0 ${config.accentColor}`} />
          <span>{format(eventDate, 'MMM d, yyyy')} · {ticket.time}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin size={14} className={`shrink-0 ${config.accentColor}`} />
          <span className="truncate">{ticket.venue}{ticket.city ? `, ${ticket.city}` : ''}</span>
        </div>
        {(ticket.section || ticket.row || ticket.seat) && (
          <div className="flex items-center gap-2">
            <TicketIcon size={14} className={`shrink-0 ${config.accentColor}`} />
            <span>
              {[
                ticket.section && `Sec ${ticket.section}`,
                ticket.row && `Row ${ticket.row}`,
                ticket.seat && `Seat ${ticket.seat}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        )}
      </div>

      {/* Footer: quantity + CTA */}
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {ticket.quantity} {ticket.quantity === 1 ? 'ticket' : 'tickets'}
        </span>

        {!past && (
          <button
            onClick={() => openTicket(ticket)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-85 ${config.buttonBg} ${config.buttonText}`}
          >
            <ExternalLink size={14} />
            Open
          </button>
        )}
      </div>
    </article>
  );
}
