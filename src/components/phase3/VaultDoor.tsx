import React from 'react';
import { motion } from 'framer-motion';

export interface VaultDoorProps {
  isOpen: boolean;
  children: React.ReactNode;
}

export const VaultDoor: React.FC<VaultDoorProps> = ({ isOpen, children }) => {
  return (
    <div className="relative w-full max-w-md mx-auto [perspective:1200px]">
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
        animate={
          isOpen
            ? {
                rotateY: -105,
                x: -30,
                scale: 0.96,
                opacity: 0.2,
                transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
              }
            : { rotateY: 0, x: 0, scale: 1, opacity: 1 }
        }
        style={{ transformOrigin: 'left center', transformStyle: 'preserve-3d' }}
        className="relative z-10 w-full rounded-3xl glass-card border border-white/20 p-6 shadow-2xl text-white backdrop-blur-xl"
      >
        {children}
      </motion.div>
    </div>
  );
};
