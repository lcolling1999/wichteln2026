import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLongPress } from '../../hooks/useLongPress';
import { soundEngine } from '../../audio/soundEngine';

interface RudolphAvatarProps {
  displayName?: string;
  initials?: string;
  isCurrentUser?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  testId?: string;
  children?: React.ReactNode;
}

export const RudolphAvatar: React.FC<RudolphAvatarProps> = ({
  displayName = 'Du',
  initials = 'DU',
  isCurrentUser = false,
  className = '',
  size = 'md',
  testId,
  children,
}) => {
  const [isRudolph, setIsRudolph] = useState<boolean>(false);

  const toggleRudolph = () => {
    const nextState = !isRudolph;
    setIsRudolph(nextState);

    if (nextState) {
      soundEngine.playBassDrop();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([30, 40, 60]);
        } catch {
          // Graceful fallback
        }
      }
    }
  };

  const longPressHandlers = useLongPress({
    thresholdMs: 800,
    maxMovementPx: 10,
    onLongPress: toggleRudolph,
    onClick: () => {
      // Toggle off if already active on click
      if (isRudolph) setIsRudolph(false);
    },
  });

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 sm:w-11 sm:h-11 text-sm',
    lg: 'w-14 h-14 text-base',
  }[size];

  const resolvedTestId = testId || (isCurrentUser ? 'my-avatar' : 'rudolph-avatar');

  return (
    <div
      {...longPressHandlers}
      data-testid={resolvedTestId}
      title={`${displayName} (Gedrückt halten für Rudolph-Modus)`}
      className={`rudolph-avatar relative flex items-center justify-center rounded-full cursor-pointer select-none transition-transform active:scale-95 ${sizeClasses} ${className}`}
    >
      {/* Golden Antlers SVG Overlay */}
      <AnimatePresence>
        {isRudolph && (
          <motion.div
            initial={{ scale: 0, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0, y: 5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            className="absolute -top-5 left-1/2 -translate-x-1/2 pointer-events-none z-30 w-12 h-8"
          >
            <svg
              viewBox="0 0 64 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full drop-shadow-[0_2px_8px_rgba(249,170,46,0.8)]"
            >
              <defs>
                <linearGradient id="goldAntler" x1="0" y1="0" x2="64" y2="36" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FDE68A" />
                  <stop offset="0.5" stopColor="#F9AA2E" />
                  <stop offset="1" stopColor="#D97706" />
                </linearGradient>
              </defs>
              {/* Left Antler with 3 festive prongs */}
              <path
                d="M 28 32 C 26 22, 18 16, 8 18 C 12 14, 18 13, 24 18 C 21 10, 15 6, 8 8 C 16 4, 24 7, 27 15 C 27 8, 23 2, 18 2 C 25 1, 31 8, 30 24 Z"
                fill="url(#goldAntler)"
              />
              {/* Right Antler with 3 festive prongs */}
              <path
                d="M 36 32 C 38 22, 46 16, 56 18 C 52 14, 46 13, 40 18 C 43 10, 49 6, 56 8 C 48 4, 40 7, 37 15 C 37 8, 41 2, 46 2 C 39 1, 33 8, 34 24 Z"
                fill="url(#goldAntler)"
              />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar Content (Children or default orb face) */}
      {children || (
        <div className="w-full h-full rounded-full flex items-center justify-center font-black tracking-tight bg-gradient-to-tr from-[#003873] to-[#005bb5] text-amber-200 border-2 border-amber-300/60 shadow-md">
          {initials}
        </div>
      )}

      {/* Glowing Ruby Red Nose */}
      <AnimatePresence>
        {isRudolph && (
          <motion.div
            data-testid="rudolph-red-nose"
            initial={{ scale: 0 }}
            animate={{ scale: [1, 1.25, 1] }}
            exit={{ scale: 0 }}
            transition={{
              scale: { repeat: Infinity, duration: 1.2, ease: 'easeInOut' },
            }}
            className="rudolph-glow absolute w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-rose-600 pointer-events-none z-40 border border-rose-300"
            style={{
              top: '52%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              boxShadow:
                '0 0 10px #f43f5e, 0 0 20px #e11d48, 0 0 35px rgba(225, 29, 72, 0.85)',
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
