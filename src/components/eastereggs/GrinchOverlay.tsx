import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { soundEngine } from '../../audio/soundEngine';

export const GrinchOverlay: React.FC = () => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const startYRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
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
    // 1. Top Pull-Down Pointer Detection
    const handlePointerDown = (e: PointerEvent | MouseEvent) => {
      // Must start near top edge (clientY <= 80) and scrolled to top
      if (e.clientY <= 80 && (typeof window === 'undefined' || window.scrollY <= 20)) {
        isDraggingRef.current = true;
        startYRef.current = e.clientY;
      }
    };

    const handlePointerMove = (e: PointerEvent | MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaY = e.clientY - startYRef.current;
      // Threshold > 120px activates Grinch Mode
      if (deltaY > 120) {
        isDraggingRef.current = false;
        triggerGrinchMode();
      }
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
    };

    // 2. Touch event listeners for mobile devices
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        if (touch.clientY <= 80 && (typeof window === 'undefined' || window.scrollY <= 20)) {
          isDraggingRef.current = true;
          startYRef.current = touch.clientY;
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length === 0) return;
      const deltaY = e.touches[0].clientY - startYRef.current;
      if (deltaY > 120) {
        isDraggingRef.current = false;
        triggerGrinchMode();
      }
    };

    // 3. Expose test helper on window
    if (typeof window !== 'undefined') {
      (window as any).__triggerGrinch = triggerGrinchMode;
      window.addEventListener('pointerdown', handlePointerDown);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
      // Mouse fallbacks
      window.addEventListener('mousedown', handlePointerDown);
      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
      // Touch listeners
      window.addEventListener('touchstart', handleTouchStart, { passive: true });
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('touchend', handlePointerUp);
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__triggerGrinch;
        window.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
        window.removeEventListener('mousedown', handlePointerDown);
        window.removeEventListener('mousemove', handlePointerMove);
        window.removeEventListener('mouseup', handlePointerUp);
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handlePointerUp);
      }
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

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
          className="grinch-mode-active fixed inset-0 z-50 flex flex-col items-center justify-start pt-12 sm:pt-16 bg-black/75 backdrop-blur-md cursor-pointer select-none overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at 50% 20%, rgba(16, 185, 129, 0.45) 0%, rgba(4, 120, 87, 0.7) 65%, rgba(2, 44, 34, 0.95) 100%)',
          }}
        >
          {/* Animated sneaky Grinch arm and head sliding down from top edge */}
          <motion.div
            initial={{ y: -160, rotate: -5 }}
            animate={{ y: 0, rotate: 0 }}
            exit={{ y: -160, rotate: 5 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20 }}
            className="flex flex-col items-center"
          >
            {/* Custom SVG Grinch Sneak */}
            <svg
              className="w-48 h-48 sm:w-60 sm:h-60 drop-shadow-[0_0_35px_rgba(16,185,129,0.8)]"
              viewBox="0 0 200 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Furry Grinch Arm reaching down */}
              <path
                d="M100 0 L100 65 Q95 85 85 105 Q80 115 70 120"
                stroke="#10B981"
                strokeWidth="24"
                strokeLinecap="round"
              />
              <path
                d="M100 0 L100 65 Q95 85 85 105 Q80 115 70 120"
                stroke="#047857"
                strokeWidth="16"
                strokeLinecap="round"
              />
              {/* Pointy Claws */}
              <path
                d="M70 120 L55 130 M70 122 L58 138 M72 125 L65 142"
                stroke="#EAB308"
                strokeWidth="4"
                strokeLinecap="round"
              />

              {/* Sneering Face */}
              <ellipse cx="120" cy="95" rx="42" ry="32" fill="#10B981" />
              <ellipse cx="120" cy="95" rx="36" ry="26" fill="#059669" />

              {/* Yellow Eyes */}
              <ellipse cx="106" cy="90" rx="9" ry="6" fill="#EAB308" transform="rotate(-15 106 90)" />
              <ellipse cx="134" cy="90" rx="9" ry="6" fill="#EAB308" transform="rotate(15 134 90)" />

              {/* Red Slit Pupils */}
              <ellipse cx="107" cy="90" rx="3" ry="5" fill="#DC2626" />
              <ellipse cx="133" cy="90" rx="3" ry="5" fill="#DC2626" />

              {/* Evil Grinch Grin */}
              <path
                d="M95 106 Q120 125 145 106"
                stroke="#022c22"
                strokeWidth="4"
                strokeLinecap="round"
                fill="none"
              />
              {/* Snarky teeth */}
              <path
                d="M110 112 L113 116 M120 114 L120 119 M130 112 L127 116"
                stroke="#FEF08A"
                strokeWidth="2"
                strokeLinecap="round"
              />

              {/* Stolen Christmas Bauble */}
              <circle cx="56" cy="144" r="14" fill="#EF4444" className="animate-pulse" />
              <rect x="53" y="128" width="6" height="4" fill="#F59E0B" rx="1" />
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
