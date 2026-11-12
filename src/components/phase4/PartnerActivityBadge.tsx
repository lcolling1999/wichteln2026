import React, { useCallback, useEffect, useState } from 'react';
import { REFRESH_EVENT } from '../common/PullToRefresh';

type ActivityStatus = 'online' | 'today' | 'yesterday' | 'days' | 'never';

interface ActivityResponse {
  status: ActivityStatus;
  daysAgo?: number;
}

export interface PartnerActivityBadgeProps {
  partnerName: string;
  /** Poll interval while the reveal screen is open */
  pollIntervalMs?: number;
}

function activityText(name: string, a: ActivityResponse): string {
  switch (a.status) {
    case 'online':
      return `${name} ist gerade online`;
    case 'today':
      return `${name} war heute aktiv`;
    case 'yesterday':
      return `${name} war gestern aktiv`;
    case 'days':
      return `${name} war vor ${a.daysAgo} Tagen aktiv`;
    default:
      return `${name} war noch nicht aktiv`;
  }
}

/** Coarse "last active" indicator of the own Wichtel partner (server only returns buckets, no timestamps). */
export const PartnerActivityBadge: React.FC<PartnerActivityBadgeProps> = ({
  partnerName,
  pollIntervalMs = 60_000,
}) => {
  const [activity, setActivity] = useState<ActivityResponse | null>(null);

  const load = useCallback(() => {
    fetch('/api/partner/activity', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ActivityResponse | null) => {
        if (data && typeof data.status === 'string') setActivity(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, pollIntervalMs);
    window.addEventListener(REFRESH_EVENT, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(REFRESH_EVENT, load);
    };
  }, [load, pollIntervalMs]);

  // Hide silently while loading or on error - it is a nice-to-have, not core information
  if (!activity) return null;

  const isOnline = activity.status === 'online';
  const dotClass = isOnline
    ? 'bg-emerald-400'
    : activity.status === 'today' || activity.status === 'yesterday'
    ? 'bg-amber-300'
    : 'bg-slate-500';

  return (
    <div
      data-testid="partner-activity-badge"
      className="inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-slate-200"
    >
      <span className="relative flex h-2 w-2">
        {isOnline && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClass}`} />
      </span>
      <span>{activityText(partnerName, activity)}</span>
    </div>
  );
};
