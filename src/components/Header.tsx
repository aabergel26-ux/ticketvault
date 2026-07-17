import { Ticket, RefreshCw, LogOut, UserPlus, Sun, Moon, X } from 'lucide-react';
import type { Account } from '../lib/auth';

interface Props {
  accounts: Account[];
  needsReconnect: Set<string>;
  ticketCount: number;
  onSync: () => void;
  onSignOut: () => void;
  onAddAccount: () => void;
  onRemoveAccount: (email: string) => void;
  onReconnectAccount: (email: string) => void;
  syncing: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export function Header({
  accounts,
  needsReconnect,
  ticketCount,
  onSync,
  onSignOut,
  onAddAccount,
  onRemoveAccount,
  onReconnectAccount,
  syncing,
  darkMode,
  onToggleDarkMode,
}: Props) {
  const isAuthenticated = accounts.length > 0;

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-950">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <Ticket className="text-indigo-500" size={22} />
        <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
          TicketVault
        </span>
        {ticketCount > 0 && (
          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
            {ticketCount}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isAuthenticated && (
          <>
            {/* Account pills */}
            <div className="hidden sm:flex flex-wrap items-center gap-1.5 mr-1">
              {accounts.map((a) => {
                const reconnecting = needsReconnect.has(a.email);
                return (
                  <span
                    key={a.email}
                    className={`flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs ${
                      reconnecting
                        ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    {a.email}
                    {reconnecting ? (
                      <button
                        onClick={() => onReconnectAccount(a.email)}
                        title={`Reconnect ${a.email} — Gmail access was revoked`}
                        className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white transition-colors hover:bg-amber-600"
                      >
                        Reconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => onRemoveAccount(a.email)}
                        title={`Disconnect ${a.email}`}
                        className="rounded-full p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>

            <button
              onClick={onAddAccount}
              title="Connect another Gmail account"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-indigo-500 dark:hover:text-indigo-300"
            >
              <UserPlus size={14} />
              <span className="hidden sm:inline">Add account</span>
            </button>

            <button
              onClick={onSync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync'}
            </button>

            <button
              onClick={onSignOut}
              title="Sign out all accounts"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-white"
            >
              <LogOut size={14} />
            </button>
          </>
        )}

        {/* Dark mode toggle */}
        <button
          onClick={onToggleDarkMode}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex items-center justify-center rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-white"
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}
