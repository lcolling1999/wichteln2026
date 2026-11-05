import React from 'react';
import { motion } from 'framer-motion';

export interface VaultDoorProps {
  isOpen: boolean;
  children: React.ReactNode;
}

/**
 * Safe door.
 *
 * Chrome on Android renders `backdrop-filter` (frosted glass) incorrectly on elements that are
 * animated with 3D transforms (flicker / element vanishes / animation does not play).
 * The swinging door therefore uses a solid, slightly translucent gradient instead of
 * backdrop-blur and is promoted to its own compositor layer.
 */
export const VaultDoor: React.FC<VaultDoorProps> = ({ isOpen, children }) => {
  return (
    <div
      className="relative w-full max-w-md mx-auto"
      style={{ perspective: '1200px', WebkitPerspective: '1200px' }}
    >
      {/* Background Revealed Light Chamber — only mounted when vault door is open */}
      {isOpen && (
        <div
          data-testid="vault-door-open"
          className="absolute inset-0 rounded-3xl overflow-hidden flex flex-col items-center justify-center bg-gradient-to-b from-amber-500/25 via-amber-400/15 to-transparent border border-amber-400/60 shadow-[0_0_60px_rgba(249,170,46,0.5)] z-0"
        >
          {/* Intense Golden Light Radiance */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(249,170,46,0.45)_0%,transparent_70%)] animate-pulse" />
          <div className="relative z-10 text-center space-y-2">
            <span className="text-5xl animate-bounce">✨</span>
            <h3 className="text-xl font-black text-amber-300 tracking-wider uppercase">
              Tresor entriegelt!
            </h3>
          </div>
        </div>
      )}

      {/* Heavy Steel Door Frame */}
      <motion.div
        initial={false}
        animate={
          isOpen
            ? {
                rotateY: -100,
                x: -24,
                scale: 0.97,
                opacity: 0,
                transition: {
                  rotateY: { duration: 1.1, ease: [0.22, 0.8, 0.3, 1] },
                  x: { duration: 1.1, ease: [0.22, 0.8, 0.3, 1] },
                  scale: { duration: 1.1, ease: [0.22, 0.8, 0.3, 1] },
                  opacity: { duration: 0.5, delay: 0.7, ease: 'easeIn' },
                },
              }
            : { rotateY: 0, x: 0, scale: 1, opacity: 1 }
        }
        style={{
          transformOrigin: 'left center',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          // Solid frosted-look gradient WITHOUT backdrop-filter (see component docs)
          background: 'linear-gradient(135deg, rgba(8, 48, 98, 0.96) 0%, rgba(3, 22, 46, 0.98) 100%)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}
        className="relative z-10 w-full rounded-3xl border border-white/20 p-6 text-white"
      >
        {children}
      </motion.div>
    </div>
  );
};
