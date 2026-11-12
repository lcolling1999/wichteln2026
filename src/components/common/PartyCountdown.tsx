import React, { useEffect, useState } from 'react';

/** 03.12.2026, 18:00 Uhr MEZ (Europe/Berlin, UTC+01:00) */
export const CHRISTMAS_PARTY_DATE_ISO = '2026-12-03T18:00:00+01:00';
const TARGET_TIMESTAMP_MS = Date.parse(CHRISTMAS_PARTY_DATE_ISO);

interface CountdownParts {
  isOver: boolean;
  totalHoursLeft: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getCountdownParts(nowMs: number = Date.now()): CountdownParts {
  const diff = TARGET_TIMESTAMP_MS - nowMs;
  if (diff <= 0) {
    return { isOver: true, totalHoursLeft: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { isOver: false, totalHoursLeft: diff / 3_600_000, days, hours, minutes, seconds };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function getGlassTheme(parts: CountdownParts) {
  if (parts.isOver) {
    return {
      container:
        'bg-gradient-to-r from-amber-950/85 via-emerald-950/85 to-amber-950/85 border-amber-300/75 shadow-[0_10px_36px_rgba(249,170,46,0.4)]',
      accentText: 'text-amber-200',
      chip: 'bg-amber-400/20 border-amber-300/40',
      pulse: true,
    };
  }
  if (parts.totalHoursLeft <= 24) {
    return {
      container:
        'bg-gradient-to-r from-amber-950/85 via-red-950/80 to-amber-950/85 border-amber-300/80 shadow-[0_10px_36px_rgba(249,170,46,0.45)]',
      accentText: 'text-amber-200',
      chip: 'bg-black/35 border-amber-300/40',
      pulse: true,
    };
  }
  if (parts.days <= 3) {
    return {
      container:
        'bg-gradient-to-r from-[#1c1607]/85 via-[#071e38]/85 to-[#1c1607]/85 border-amber-400/60 shadow-[0_10px_34px_rgba(249,170,46,0.3)]',
      accentText: 'text-amber-300',
      chip: 'bg-[#001932]/75 border-amber-300/30',
      pulse: true,
    };
  }
  if (parts.days <= 14) {
    return {
      container:
        'bg-[#041d3b]/75 border-amber-300/35 shadow-[0_10px_32px_rgba(249,170,46,0.18)]',
      accentText: 'text-amber-300',
      chip: 'bg-[#00142b]/75 border-white/15',
      pulse: false,
    };
  }
  return {
    container:
      'bg-[#021936]/75 border-sky-300/25 shadow-[0_10px_32px_rgba(0,12,30,0.65)]',
    accentText: 'text-sky-200',
    chip: 'bg-[#001226]/75 border-white/10',
    pulse: false,
  };
}

export interface PartyCountdownProps {
  className?: string;
}

/**
 * Floating frosted-glass bottom bar showing the countdown to the Christmas party.
 * Its tint and glow intensify as 03.12. 18:00 gets closer.
 */
export const PartyCountdown: React.FC<PartyCountdownProps> = ({ className = '' }) => {
  const [parts, setParts] = useState<CountdownParts>(() => getCountdownParts());

  useEffect(() => {
    const timer = setInterval(() => {
      setParts(getCountdownParts());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const theme = getGlassTheme(parts);
  const units = [
    { label: 'T', value: String(parts.days) },
    { label: 'Std', value: pad2(parts.hours) },
    { label: 'Min', value: pad2(parts.minutes) },
    { label: 'Sek', value: pad2(parts.seconds) },
  ];

  return (
    <div
      data-testid="party-countdown"
      className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.25rem)] max-w-lg backdrop-blur-2xl rounded-2xl border px-3.5 py-2.5 transition-colors duration-500 ${theme.container} ${className}`}
      style={{ WebkitBackdropFilter: 'blur(20px)' }}
    >
      {parts.isOver ? (
        <div className="flex items-center justify-center gap-2 text-center py-0.5">
          <span className="text-base">🥂</span>
          <span className="text-xs sm:text-sm font-bold text-amber-200">
            Die Weihnachtsfeier läuft! · Gasthof Sack, Konradsreuth
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2.5">
          {/* Left: Event & Location */}
          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-1.5">
              {theme.pulse && (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                </span>
              )}
              <span className={`text-[11px] sm:text-xs font-extrabold tracking-tight truncate ${theme.accentText}`}>
                🎄 03.12. · 18:00 Uhr
              </span>
            </div>
            <span className="text-[10px] sm:text-[11px] text-slate-300/90 truncate">
              📍 Gasthof Sack, Konradsreuth
            </span>
          </div>

          {/* Right: Compact Frosted Countdown Chips */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {units.map((u) => (
              <div
                key={u.label}
                className={`flex flex-col items-center justify-center min-w-[36px] sm:min-w-[42px] py-1 px-1.5 rounded-xl border ${theme.chip}`}
              >
                <span className="text-xs sm:text-sm font-extrabold text-white tabular-nums leading-none">
                  {u.value}
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-200/80 mt-0.5 leading-none">
                  {u.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
