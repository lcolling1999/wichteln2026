import React, { useRef, useState, useEffect, useCallback } from 'react';

export interface SafeRotaryDialProps {
  onDeltaRotate?: (delta: number) => void;
  onGraduationTick?: () => void;
  onClickDial?: () => void;
  visualAngle: number;
  disabled?: boolean;
  className?: string;
}

export const SafeRotaryDial: React.FC<SafeRotaryDialProps> = ({
  onDeltaRotate,
  onGraduationTick,
  onClickDial,
  visualAngle,
  disabled = false,
  className = '',
}) => {
  const dialRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastAngleRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const getPointerAngle = useCallback((clientX: number, clientY: number): number => {
    if (!dialRef.current) return 0;
    const rect = dialRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
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

    const angle = getPointerAngle(e.clientX, e.clientY);
    lastAngleRef.current = angle;
    activePointerIdRef.current = e.pointerId;
    setIsDragging(true);
    onClickDial?.();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || activePointerIdRef.current !== e.pointerId) return;

    const currentAngle = getPointerAngle(e.clientX, e.clientY);
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
    onDeltaRotate?.(delta);
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

  return (
    <div
      ref={dialRef}
      data-testid="safe-rotary-dial"
      role="slider"
      aria-label="Safe-Drehknauf"
      aria-valuenow={Math.round(visualAngle)}
      aria-valuemin={0}
      aria-valuemax={360}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative w-48 h-48 sm:w-56 sm:h-56 rounded-full select-none touch-none cursor-grab active:cursor-grabbing flex items-center justify-center p-3 transition-transform ${
        isDragging ? 'scale-[1.02]' : 'hover:scale-[1.01]'
      } ${className}`}
      style={{ touchAction: 'none' }}
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
        {/* Graduation Notches */}
        {notches.map((deg) => (
          <div
            key={deg}
            className="absolute top-1 left-1/2 -translate-x-1/2 origin-[50%_92px] pointer-events-none"
            style={{ transform: `rotate(${deg}deg)` }}
          >
            <div
              className={`w-0.5 rounded-full ${
                deg % 90 === 0
                  ? 'h-3.5 bg-amber-400 shadow-[0_0_4px_#F9AA2E]'
                  : deg % 45 === 0
                  ? 'h-2.5 bg-slate-200'
                  : 'h-1.5 bg-slate-500'
              }`}
            />
          </div>
        ))}

        {/* 12 o'clock Gold Needle / Notch */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[8px] border-t-amber-400 drop-shadow-[0_0_4px_#F9AA2E]" />

        {/* Center Golden Glowing Hub */}
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 flex items-center justify-center shadow-[0_0_25px_rgba(249,170,46,0.5),inset_0_2px_4px_rgba(255,255,255,0.4)] border border-yellow-200/60">
          <span className="text-xl sm:text-2xl drop-shadow select-none">🔐</span>
        </div>
      </div>
    </div>
  );
};
