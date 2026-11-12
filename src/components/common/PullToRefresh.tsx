import React, { useEffect, useRef, useState } from 'react';

/** Name of the window event fired on a successful pull-to-refresh. Components listen to reload their own data. */
export const REFRESH_EVENT = 'wichteln:refresh';

/** Pull distance (px) from which releasing triggers a refresh */
export const PULL_REFRESH_THRESHOLD = 80;
/** Pulling further than this is reserved for the Grinch easter egg (see GrinchOverlay) */
export const PULL_GRINCH_THRESHOLD = 180;

interface PullToRefreshProps {
  /** Reloads app-level data (status, participants). Resolves when done. */
  onRefresh: () => Promise<unknown> | void;
  /** Disable pull-to-refresh (e.g. during the rotary safe dial phase) */
  disabled?: boolean;
}

/**
 * Soft pull-to-refresh: replaces Chrome's native full page reload (disabled via overscroll-behavior)
 * with a targeted data refresh. Only active while the page is scrolled to the very top.
 */
export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, disabled = false }) => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (disabled) {
      startYRef.current = null;
      pullRef.current = 0;
      setPull(0);
      return;
    }
    const reset = () => {
      startYRef.current = null;
      pullRef.current = 0;
      setPull(0);
    };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      // Do not hijack scrolling inside text fields
      if (target?.closest?.('textarea, input')) return;
      if (window.scrollY > 0) return;
      startYRef.current = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (startYRef.current === null || e.touches.length === 0) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0 || window.scrollY > 0) {
        if (pullRef.current !== 0) {
          pullRef.current = 0;
          setPull(0);
        }
        return;
      }
      // Rubber-band damping
      const damped = Math.min(delta, PULL_GRINCH_THRESHOLD);
      pullRef.current = damped;
      setPull(damped);
    };

    const onEnd = async () => {
      const distance = pullRef.current;
      const wasActive = startYRef.current !== null;
      reset();
      // Pulls beyond the Grinch threshold belong to the easter egg - no refresh then
      if (!wasActive || distance < PULL_REFRESH_THRESHOLD || distance >= PULL_GRINCH_THRESHOLD) return;

      refreshingRef.current = true;
      setRefreshing(true);
      try {
        window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
        await Promise.all([
          onRefreshRef.current?.(),
          new Promise((r) => setTimeout(r, 600)), // keep spinner visible long enough to notice
        ]);
      } catch {
        // errors are surfaced by the individual components / connection banner
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', reset);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', reset);
    };
  }, [disabled]);

  const visible = refreshing || pull > 10;
  if (!visible) return null;

  const ready = pull >= PULL_REFRESH_THRESHOLD;
  const offset = refreshing ? 56 : Math.min(pull * 0.6, 64);

  return (
    <div
      data-testid="pull-to-refresh-indicator"
      aria-live="polite"
      className="fixed left-1/2 z-40 -translate-x-1/2 pointer-events-none px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#001932]/90 border border-amber-300/40 text-amber-200 shadow-lg backdrop-blur-md flex items-center gap-2"
      style={{ top: offset }}
    >
      {refreshing ? (
        <>
          <span className="inline-block w-3 h-3 rounded-full border-2 border-amber-300 border-t-transparent animate-spin" />
          Aktualisiere...
        </>
      ) : ready ? (
        <>↻ Loslassen zum Aktualisieren</>
      ) : (
        <>↓ Zum Aktualisieren ziehen</>
      )}
    </div>
  );
};
