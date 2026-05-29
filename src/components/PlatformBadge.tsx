import type { Platform } from '../types';
import { PLATFORMS } from '../lib/platforms';

interface Props {
  platform: Platform;
}

export function PlatformBadge({ platform }: Props) {
  const config = PLATFORMS[platform];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold tracking-wide uppercase ${config.badgeBg} ${config.badgeText}`}
    >
      {config.logo} {config.label}
    </span>
  );
}
