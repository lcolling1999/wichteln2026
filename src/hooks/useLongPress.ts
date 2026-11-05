import { useRef, useCallback } from 'react';

export interface UseLongPressOptions {
  thresholdMs?: number;        // Duration in ms before trigger (default: 800)
  maxMovementPx?: number;      // Maximum pointer movement allowed before cancel (default: 10)
  onLongPress: () => void;     // Callback when long-press successfully triggers
  onClick?: () => void;        // Optional callback for regular short clicks
}

export function useLongPress(options: UseLongPressOptions) {
  const {
    thresholdMs = 800,
    maxMovementPx = 10,
    onLongPress,
    onClick,
  } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isTriggeredRef = useRef<boolean>(false);

  const start = useCallback(
    (clientX: number, clientY: number) => {
      isTriggeredRef.current = false;
      startPosRef.current = { x: clientX, y: clientY };

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        isTriggeredRef.current = true;
        onLongPress();
      }, thresholdMs);
    },
    [onLongPress, thresholdMs]
  );

  const move = useCallback(
    (clientX: number, clientY: number) => {
      if (!timerRef.current) return;
      const dx = clientX - startPosRef.current.x;
      const dy = clientY - startPosRef.current.y;
      if (Math.hypot(dx, dy) > maxMovementPx) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [maxMovementPx]
  );

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const end = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      if (!isTriggeredRef.current) {
        onClick?.();
      }
    }
  }, [onClick]);

  return {
    // Mouse events
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      start(e.clientX, e.clientY);
    },
    onMouseMove: (e: React.MouseEvent) => move(e.clientX, e.clientY),
    onMouseUp: () => end(),
    onMouseLeave: () => cancel(),

    // Touch events
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length > 0) {
        start(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (e.touches.length > 0) {
        move(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    onTouchEnd: () => end(),
    onTouchCancel: () => cancel(),
  };
}
