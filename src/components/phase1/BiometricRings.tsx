import React from 'react';
import { motion } from 'framer-motion';

interface BiometricRingsProps {
  state?: 'scanning' | 'success' | 'error';
  participantName?: string;
}

export const BiometricRings: React.FC<BiometricRingsProps> = ({
  state = 'scanning',
  participantName,
}) => {
  return (
    <div
      data-testid="biometric-pulse-ring"
      className="biometric-pulse relative flex flex-col items-center justify-center p-6 my-2"
    >
      <div className="relative w-44 h-44 flex items-center justify-center">
        {/* Ring 1 - Outer Wave */}
        <motion.div
          animate={
            state === 'scanning'
              ? {
                  scale: [0.9, 1.85, 2.2],
                  opacity: [0.8, 0.4, 0],
                }
              : { scale: 1, opacity: 0.3 }
          }
          transition={{
            duration: 2.2,
            repeat: state === 'scanning' ? Infinity : 0,
            ease: [0.215, 0.61, 0.355, 1],
            delay: 0,
          }}
          className="absolute inset-0 rounded-full border-2 border-[#F9AA2E]/70 pointer-events-none"
          style={{ filter: 'drop-shadow(0 0 10px rgba(249, 170, 46, 0.5))' }}
        />

        {/* Ring 2 - Middle Wave */}
        <motion.div
          animate={
            state === 'scanning'
              ? {
                  scale: [0.85, 1.55, 1.9],
                  opacity: [0.9, 0.45, 0],
                }
              : { scale: 1, opacity: 0.4 }
          }
          transition={{
            duration: 2.2,
            repeat: state === 'scanning' ? Infinity : 0,
            ease: [0.215, 0.61, 0.355, 1],
            delay: 0.65,
          }}
          className="absolute inset-2 rounded-full border-2 border-[#F9AA2E]/60 pointer-events-none"
          style={{ filter: 'drop-shadow(0 0 14px rgba(249, 170, 46, 0.4))' }}
        />

        {/* Ring 3 - Inner Wave */}
        <motion.div
          animate={
            state === 'scanning'
              ? {
                  scale: [0.8, 1.3, 1.6],
                  opacity: [0.95, 0.5, 0],
                }
              : { scale: 1, opacity: 0.5 }
          }
          transition={{
            duration: 2.2,
            repeat: state === 'scanning' ? Infinity : 0,
            ease: [0.215, 0.61, 0.355, 1],
            delay: 1.3,
          }}
          className="absolute inset-4 rounded-full border-2 border-white/50 pointer-events-none"
          style={{ filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.5))' }}
        />

        {/* Center Glowing Disc */}
        <div className="relative z-10 w-24 h-24 rounded-full bg-gradient-to-tr from-[#004891] via-[#003166] to-[#001f42] border-2 border-[#F9AA2E] flex items-center justify-center shadow-[0_0_25px_rgba(249,170,46,0.5)]">
          {/* Biometric SVG Fingerprint Icon */}
          <svg
            data-testid="biometric-icon"
            className="biometric-icon w-12 h-12 text-[#F9AA2E] transition-transform duration-300 transform group-hover:scale-105"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
            <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
            <path d="M17.29 21.02c.12-.6.43-2.3.43-3.02 0-2.28-.73-4.88-2.72-7" />
            <path d="M2 12a10 10 0 0 1 18-6" />
            <path d="M2 16h.01" />
            <path d="M21.8 16c.2-2 .131-5.354 0-6" />
            <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
            <path d="M8.65 22c.21-.66.45-1.32.57-2" />
            <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
          </svg>
        </div>
      </div>

      <div className="mt-4 text-center">
        <p className="text-sm font-semibold text-amber-300 animate-pulse">
          Biometrische Bestätigung aktiv
        </p>
        <p className="text-xs text-white/70 mt-1">
          {participantName
            ? `Passkey für ${participantName} wird eingerichtet / geprüft`
            : 'Berühre deinen Fingerabdrucksensor oder nutze Face ID'}
        </p>
      </div>
    </div>
  );
};
