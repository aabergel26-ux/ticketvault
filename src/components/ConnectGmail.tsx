import { Mail } from 'lucide-react';

interface Props {
  onConnect: () => void;
}

export function ConnectGmail({ onConnect }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-gray-300 py-24 text-center dark:border-gray-700">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
        <Mail size={32} className="text-indigo-500" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Connect your Gmail</h2>
        <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          TicketVault scans your inbox for ticket confirmations from Ticketmaster, AXS, DICE, and
          StubHub — all in one place.
        </p>
      </div>
      <button
        onClick={onConnect}
        className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Mail size={18} />
        Connect Gmail
      </button>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Read-only access · We never store your emails
      </p>
    </div>
  );
}
