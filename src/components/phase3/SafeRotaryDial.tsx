import React, { useRef, useState, useEffect, useCallback } from 'react';

export interface SafeRotaryDialProps {
  onDeltaRotate?: (delta: number) => void;
  onGraduationTick?: () => void;
  onClickDial?: () => void;
  visualAngle: number;
  disabled?: boolean;
  className?: string;
  /** 0 (cold) .. 1 (hot): drives the warm glow around the dial */
  proximity?: number;
  /** The dial currently turns against the direction the active bolt needs */
  wrongDirection?: boolean;
}

/** Keyboard step in degrees (accessibility: arrow keys rotate the dial) */
const KEYBOARD_STEP_DEG = 6;
/** Touches closer to the center than this fraction of the dial width are ignored (unstable angle) */
const CENTER_DEAD_ZONE = 0.14;

export const SafeRotaryDial: React.FC<SafeRotaryDialProps> = ({
  onDeltaRotate,
  onGraduationTick,
  onClickDial,
  visualAngle,
  disabled = false,
  className = '',
  proximity = 0,
  wrongDirection = false,
}) => {
  const dialRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastAngleRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const getPointerAngle = useCallback((clientX: number, clientY: number): number | null => {
    if (!dialRef.current) return 0;
    const rect = dialRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Near the hub the angle jumps wildly between events (esp. with a thumb on Android)
    if (Math.hypot(clientX - cx, clientY - cy) < rect.width * CENTER_DEAD_ZONE) {
      return null;
    }
    const rad = Math.atan2(clientY - cy, clientX - cx);
    let deg = (rad * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Graceful fallback if pointer capture unsupported
    }

    lastAngleRef.current = getPointerAngle(e.clientX, e.clientY);
    activePointerIdRef.current = e.pointerId;
    setIsDragging(true);
    onClickDial?.();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Use the ref (not the isDragging state): the state is updated asynchronously and would
    // swallow the first move events of a fast swipe.
    if (disabled || activePointerIdRef.current !== e.pointerId) return;

    const currentAngle = getPointerAngle(e.clientX, e.clientY);
    if (currentAngle === null) return;

    const prevAngle = lastAngleRef.current;
    if (prevAngle === null) {
      lastAngleRef.current = currentAngle;
      return;
    }

    // Shortest angular difference modulo 360 (-180 to +180)
    let delta = currentAngle - prevAngle;
    if (delta > 180) {
      delta -= 360;
    } else if (delta < -180) {
      delta += 360;
    }

    lastAngleRef.current = currentAngle;
    if (delta !== 0) {
      onDeltaRotate?.(delta);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onDeltaRotate?.(KEYBOARD_STEP_DEG);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onDeltaRotate?.(-KEYBOARD_STEP_DEG);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current === e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setIsDragging(false);
      lastAngleRef.current = null;
      activePointerIdRef.current = null;
    }
  };

  // Window-level safety cleanup for TC-B5-04 (Interrupted Gesture / Pointer Cancel)
  useEffect(() => {
    const handleWindowEnd = () => {
      setIsDragging(false);
      lastAngleRef.current = null;
      activePointerIdRef.current = null;
    };

    window.addEventListener('pointerup', handleWindowEnd);
    window.addEventListener('pointercancel', handleWindowEnd);
    window.addEventListener('mouseup', handleWindowEnd);
    window.addEventListener('touchend', handleWindowEnd);

    return () => {
      window.removeEventListener('pointerup', handleWindowEnd);
      window.removeEventListener('pointercancel', handleWindowEnd);
      window.removeEventListener('mouseup', handleWindowEnd);
      window.removeEventListener('touchend', handleWindowEnd);
    };
  }, []);

  // 24 Graduation Notches (every 15 degrees, matching 24 colleagues)
  const notches = Array.from({ length: 24 }, (_, i) => i * 15);

  // Warm glow grows with proximity to the active bolt; wrong direction glows red instead
  const glowRgb = wrongDirection ? '239, 68, 68' : '249, 170, 46';
  const glowAlpha = wrongDirection ? 0.35 : 0.1 + proximity * 0.7;
  const glowSize = wrongDirection ? 22 : 12 + proximity * 34;

  return (
    <div
      ref={dialRef}
      data-testid="safe-rotary-dial"
      role="slider"
      aria-label="Safe-Drehknauf"
      aria-valuenow={Math.round(((visualAngle % 360) + 360) % 360)}
      aria-valuemin={0}
      aria-valuemax={360}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      className={`relative w-48 h-48 sm:w-56 sm:h-56 rounded-full select-none touch-none cursor-grab active:cursor-grabbing flex items-center justify-center p-3 transition-transform ${
        isDragging ? 'scale-[1.02]' : 'hover:scale-[1.01]'
      } ${className}`}
      style={{
        touchAction: 'none',
        WebkitTapHighlightColor: 'transparent',
        boxShadow: `0 0 ${glowSize}px rgba(${glowRgb}, ${glowAlpha})`,
        transition: 'box-shadow 0.12s ease-out, transform 0.15s ease-out',
      }}
    >
      {/* Outer Knurled Metallic Texture Ring */}
      <div
        className="absolute inset-0 rounded-full border-4 border-slate-700/80 shadow-[0_0_35px_rgba(0,72,145,0.4),inset_0_2px_4px_rgba(255,255,255,0.2)]"
        style={{
          background:
            'conic-gradient(from 0deg, #1e293b, #475569, #334155, #64748b, #1e293b, #475569, #334155, #64748b, #1e293b)',
        }}
      />

      {/* SVG Radial Knurling Marks */}
      <svg
        className="absolute inset-1.5 w-[calc(100%-12px)] h-[calc(100%-12px)] pointer-events-none"
        viewBox="0 0 200 200"
      >
        <circle
          cx="100"
          cy="100"
          r="92"
          fill="none"
          stroke="rgba(249, 170, 46, 0.25)"
          strokeWidth="3"
          strokeDasharray="2 6"
        />
      </svg>

      {/* Rotating Dial Faceplate */}
      <div
        className="relative w-full h-full rounded-full flex items-center justify-center shadow-[inset_0_4px_12px_rgba(0,0,0,0.8)] border border-slate-600/50"
        style={{
          transform: `rotate(${visualAngle}deg)`,
          background: 'radial-gradient(circle, #1e293b 0%, #0f172a 75%, #020617 100%)',
        }}
      >
        {/* Crisp centered SVG graduation notches + 12 o'clock pointer */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 200 200"
          aria-hidden="true"
        >
          {notches.map((deg) => {
            if (deg === 0) {
              // 12 o'clock gold pointer triangle (replaces the 0° line cleanly without overlap)
              return (
                <polygon
                  key={deg}
                  points="100,20 94,8 106,8"
                  fill="#F9AA2E"
                />
              );
            }
            const isMajor = deg % 90 === 0;
            const isMid = deg % 45 === 0;
            const y2 = isMajor ? 22 : isMid ? 18 : 14;
            return (
              <line
                key={deg}
                x1="100"
                y1="6"
                x2="100"
                y2={y2}
                stroke={isMajor ? '#F9AA2E' : isMid ? '#E2E8F0' : '#64748B'}
                strokeWidth={isMajor ? 2.5 : 1.8}
                strokeLinecap="round"
                transform={`rotate(${deg} 100 100)`}
              />
            );
          })}
        </svg>

        {/* Center Golden Glowing Hub */}
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 flex items-center justify-center shadow-[0_0_25px_rgba(249,170,46,0.5),inset_0_2px_4px_rgba(255,255,255,0.4)] border border-yellow-200/60">
          <span className="text-xl sm:text-2xl drop-shadow select-none">🔐</span>
        </div>
      </div>
    </div>
  );
};
