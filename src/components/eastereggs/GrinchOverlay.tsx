import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { soundEngine } from '../../audio/soundEngine';

export interface GrinchOverlayProps {
  /** Disable pull-down gesture (e.g. during the rotary safe dial phase) */
  disabled?: boolean;
}

export const GrinchOverlay: React.FC<GrinchOverlayProps> = ({ disabled = false }) => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const mouseStartYRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerGrinchMode = () => {
    setIsActive(true);
    soundEngine.playGrinchSound();

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    // Auto-dismiss after 4 seconds
    dismissTimerRef.current = setTimeout(() => {
      setIsActive(false);
    }, 4000);
  };

  useEffect(() => {
    if (disabled) {
      mouseStartYRef.current = null;
      touchStartYRef.current = null;
      return;
    }
    const GRINCH_THRESHOLD_PX = 180;

    const isEligibleTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !el?.closest?.('textarea, input');
    };

    const isAtTop = () => typeof window === 'undefined' || window.scrollY <= 20;

    // 1. Desktop mouse pull-down detection (separate from touch so pointercancel cannot abort touch)
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && isAtTop() && isEligibleTarget(e.target)) {
        mouseStartYRef.current = e.clientY;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (mouseStartYRef.current === null) return;
      if (!isAtTop()) {
        mouseStartYRef.current = null;
        return;
      }
      if (e.clientY - mouseStartYRef.current > GRINCH_THRESHOLD_PX) {
        mouseStartYRef.current = null;
        triggerGrinchMode();
      }
    };

    const handleMouseUp = () => {
      mouseStartYRef.current = null;
    };

    // 2. Touch event listeners for mobile devices (Android Chrome / iOS Safari)
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1 && isAtTop() && isEligibleTarget(e.target)) {
        touchStartYRef.current = e.touches[0].clientY;
      } else {
        touchStartYRef.current = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartYRef.current === null || e.touches.length === 0) return;
      if (!isAtTop()) {
        touchStartYRef.current = null;
        return;
      }
      const deltaY = e.touches[0].clientY - touchStartYRef.current;
      if (deltaY > GRINCH_THRESHOLD_PX) {
        touchStartYRef.current = null;
        triggerGrinchMode();
      }
    };

    const handleTouchEnd = () => {
      touchStartYRef.current = null;
    };

    // 3. Expose test helper on window
    if (typeof window !== 'undefined') {
      (window as any).__triggerGrinch = triggerGrinchMode;
      window.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchstart', handleTouchStart, { passive: true });
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('touchend', handleTouchEnd);
      window.addEventListener('touchcancel', handleTouchEnd);
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__triggerGrinch;
        window.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
        window.removeEventListener('touchcancel', handleTouchEnd);
      }
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [disabled]);

  const handleDismiss = () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setIsActive(false);
  };

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          data-testid="grinch-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={handleDismiss}
          className="grinch-mode-active fixed inset-0 z-50 flex flex-col items-center justify-start pt-10 sm:pt-14 bg-black/75 backdrop-blur-md cursor-pointer select-none overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at 50% 25%, rgba(16, 185, 129, 0.4) 0%, rgba(4, 120, 87, 0.72) 65%, rgba(2, 44, 34, 0.95) 100%)',
          }}
        >
          {/* Animated sneaky Grinch sliding down from top edge */}
          <motion.div
            initial={{ y: -220, rotate: -4 }}
            animate={{ y: 0, rotate: 0 }}
            exit={{ y: -220, rotate: 4 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20 }}
            className="flex flex-col items-center px-4"
          >
            {/* Custom SVG Grinch with Santa Hat & Stolen Bauble */}
            <svg
              className="w-56 h-52 sm:w-64 sm:h-60 drop-shadow-[0_12px_35px_rgba(16,185,129,0.65)]"
              viewBox="0 0 240 220"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Santa Hat (tilted) */}
              <path
                d="M78 62 C82 24, 130 12, 168 38 C178 45, 186 58, 182 70 L162 66 C158 50, 145 46, 135 56 Z"
                fill="#DC2626"
              />
              {/* Hat Pom-Pom */}
              <circle cx="176" cy="70" r="11" fill="#F8FAFC" />
              {/* Hat White Fur Trim */}
              <rect x="72" y="56" width="88" height="18" rx="9" transform="rotate(-6 72 56)" fill="#F8FAFC" />

              {/* Grinch Pear-Shaped Furry Head */}
              <path
                d="M118 60 C142 60, 154 78, 158 96 C164 110, 168 128, 152 142 C138 154, 102 154, 88 142 C72 128, 76 110, 82 96 C86 78, 96 60, 118 60 Z"
                fill="#10B981"
              />
              {/* Cheek Fur Tufts */}
              <path
                d="M78 120 L68 118 L75 128 L66 132 L78 136 M158 120 L168 118 L161 128 L170 132 L158 136"
                stroke="#10B981"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Inner Face Shading */}
              <ellipse cx="118" cy="116" rx="34" ry="26" fill="#059669" opacity="0.45" />

              {/* Evil Slanted Eyebrows */}
              <path
                d="M90 88 L112 96 M146 88 L124 96"
                stroke="#064E3B"
                strokeWidth="5"
                strokeLinecap="round"
              />

              {/* Yellow Grinch Eyes */}
              <ellipse cx="103" cy="100" rx="10" ry="7" fill="#FACC15" transform="rotate(-10 103 100)" />
              <ellipse cx="133" cy="100" rx="10" ry="7" fill="#FACC15" transform="rotate(10 133 100)" />

              {/* Red Slit Pupils + Catchlight */}
              <ellipse cx="104" cy="100" rx="3.2" ry="5.5" fill="#DC2626" />
              <ellipse cx="132" cy="100" rx="3.2" ry="5.5" fill="#DC2626" />
              <circle cx="102" cy="98" r="1.3" fill="#FFFFFF" />
              <circle cx="130" cy="98" r="1.3" fill="#FFFFFF" />

              {/* Small Grinch Nose */}
              <path
                d="M114 111 Q118 115 122 111"
                stroke="#064E3B"
                strokeWidth="3.5"
                strokeLinecap="round"
                fill="none"
              />

              {/* Classic Wide Grinch Grin */}
              <path
                d="M90 124 Q118 144 146 124"
                stroke="#022C22"
                strokeWidth="4.5"
                strokeLinecap="round"
                fill="none"
              />
              {/* Mouth Corner Dimples */}
              <path
                d="M88 120 Q88 126 92 126 M148 120 Q148 126 144 126"
                stroke="#022C22"
                strokeWidth="3"
                strokeLinecap="round"
              />
              {/* Snarky Teeth */}
              <path
                d="M105 131 L108 136 M118 134 L118 139 M131 131 L128 136"
                stroke="#FEF08A"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Santa Coat Shoulders & Arm Holding Bauble */}
              <path
                d="M84 150 C96 156, 140 156, 152 150 L162 182 L76 182 Z"
                fill="#DC2626"
              />
              {/* White Coat Collar */}
              <path
                d="M84 150 Q118 164 152 150"
                stroke="#F8FAFC"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
              />

              {/* Grinch Arm + Hand Reaching Left with Stolen Bauble */}
              <path
                d="M82 162 Q58 164 52 152"
                stroke="#DC2626"
                strokeWidth="18"
                strokeLinecap="round"
              />
              {/* White Cuff */}
              <circle cx="56" cy="155" r="9" fill="#F8FAFC" />
              {/* Green Furry Clawed Hand */}
              <circle cx="48" cy="150" r="8" fill="#10B981" />
              <path
                d="M42 148 L36 154 M46 154 L41 160 M52 155 L49 162"
                stroke="#EAB308"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Stolen Red Christmas Bauble */}
              <line x1="42" y1="156" x2="42" y2="168" stroke="#F59E0B" strokeWidth="2" />
              <rect x="38" y="166" width="8" height="5" rx="1.5" fill="#F59E0B" />
              <circle cx="42" cy="186" r="16" fill="#EF4444" className="animate-pulse" />
              <ellipse cx="36" cy="180" rx="4" ry="6" transform="rotate(-25 36 180)" fill="#FCA5A5" opacity="0.65" />
            </svg>

            {/* Mischievous Grinch Caption */}
            <div className="text-center mt-3 space-y-1">
              <h2 className="text-2xl sm:text-3xl font-black text-emerald-300 tracking-wider drop-shadow-md">
                HEHEHE! 🎄
              </h2>
              <p className="text-base sm:text-lg font-bold text-emerald-100">
                WICHTELN GESTOHLEN!
              </p>
              <span className="inline-block px-3 py-1 mt-2 text-xs font-semibold rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">
                Tippen zum Verscheuchen
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
