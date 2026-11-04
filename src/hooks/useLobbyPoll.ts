import { useState, useEffect, useRef, useCallback } from 'react';
import { Participant, DrawStatus } from '../types';

export interface UseLobbyPollOptions {
  baseIntervalMs?: number; // default: 3500ms
  maxIntervalMs?: number;  // default: 15000ms
  enabled?: boolean;       // default: true
  onDrawComplete?: (status: DrawStatus) => void;
}

export function useLobbyPoll(options: UseLobbyPollOptions = {}) {
  const {
    baseIntervalMs = 3500,
    maxIntervalMs = 15000,
    enabled = true,
    onDrawComplete,
  } = options;

  const [status, setStatus] = useState<DrawStatus | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const prevIsDrawnRef = useRef<boolean>(false);
  const consecutiveFailuresRef = useRef<number>(0);
  const timerRef = useRef<any>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const onDrawCompleteRef = useRef(onDrawComplete);
  onDrawCompleteRef.current = onDrawComplete;

  const fetchStatusAndParticipants = useCallback(async () => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    try {
      const [statusRes, participantsRes] = await Promise.all([
        fetch('/api/status', { signal: ctrl.signal }),
        fetch('/api/participants', { signal: ctrl.signal }),
      ]);

      if (!statusRes.ok || !participantsRes.ok) {
        throw new Error(`API error: status=${statusRes.status}, participants=${participantsRes.status}`);
      }

      const statusData: DrawStatus = await statusRes.json();
      const participantsData: Participant[] = await participantsRes.json();

      setStatus(statusData);
      setParticipants(participantsData);
      setError(null);
      consecutiveFailuresRef.current = 0;

      if (statusData.isDrawn && !prevIsDrawnRef.current) {
        prevIsDrawnRef.current = true;
        if (onDrawCompleteRef.current) {
          onDrawCompleteRef.current(statusData);
        }
      } else {
        prevIsDrawnRef.current = statusData.isDrawn;
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        consecutiveFailuresRef.current += 1;
        setError(err);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let isSubscribed = true;

    const scheduleNextPoll = () => {
      if (!isSubscribed) return;

      const failureCount = consecutiveFailuresRef.current;
      const backoffMultiplier = Math.min(Math.pow(1.5, failureCount), maxIntervalMs / baseIntervalMs);
      const isHidden = typeof document !== 'undefined' && document.hidden;
      const interval = isHidden ? 20000 : Math.round(baseIntervalMs * backoffMultiplier);

      timerRef.current = setTimeout(async () => {
        if (!isSubscribed) return;
        await fetchStatusAndParticipants();
        scheduleNextPoll();
      }, interval);
    };

    fetchStatusAndParticipants().then(() => {
      scheduleNextPoll();
    });

    const handleVisibilityChange = () => {
      if (!document.hidden && isSubscribed) {
        consecutiveFailuresRef.current = 0;
        if (timerRef.current) clearTimeout(timerRef.current);
        fetchStatusAndParticipants().then(() => {
          scheduleNextPoll();
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isSubscribed = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortCtrlRef.current) abortCtrlRef.current.abort();
    };
  }, [enabled, baseIntervalMs, maxIntervalMs, fetchStatusAndParticipants]);

  return {
    status,
    participants,
    registeredCount: status?.registeredCount ?? participants.filter((p) => p.isRegistered).length,
    isDrawn: status?.isDrawn ?? false,
    isLoading,
    error,
    refetch: fetchStatusAndParticipants,
  };
}
