import type { Platform } from '../types';
import { PLATFORMS } from '../lib/platforms';

type StatusFilter = 'all' | 'upcoming' | 'past';

interface Props {
  selectedPlatforms: Platform[];
  onPlatformToggle: (p: Platform) => void;
  statusFilter: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
}

const ACTIVE_PLATFORMS: Platform[] = ['ticketmaster', 'axs', 'dice', 'stubhub'];
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
];

export function FilterBar({ selectedPlatforms, onPlatformToggle, statusFilter, onStatusChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Status toggle group */}
      <div className="flex overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        {STATUS_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onStatusChange(value)}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === value
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Platform toggles */}
      <div className="flex flex-wrap gap-2">
        {ACTIVE_PLATFORMS.map((p) => {
          const cfg = PLATFORMS[p];
          const active = selectedPlatforms.includes(p);
          return (
            <button
              key={p}
              onClick={() => onPlatformToggle(p)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                active
                  ? `${cfg.badgeBg} ${cfg.badgeText} border-transparent`
                  : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-900 dark:border-gray-600 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {cfg.logo} {cfg.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
