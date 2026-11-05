import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface SnowstormOverlayProps {
  isBlizzard: boolean;
}

export const SnowstormOverlay: React.FC<SnowstormOverlayProps> = ({ isBlizzard }) => {
  return (
    <AnimatePresence>
      {isBlizzard && (
        <motion.div
          data-testid="snowstorm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="blizzard-active fixed inset-0 pointer-events-none z-40 flex flex-col justify-between items-center p-6 overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.08) 0%, rgba(186, 230, 253, 0.15) 60%, rgba(14, 165, 233, 0.22) 100%)',
            boxShadow: 'inset 0 0 100px rgba(255, 255, 255, 0.35)',
          }}
        >
          {/* Top Banner Notice */}
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="px-4 py-1.5 rounded-full bg-cyan-900/80 border border-cyan-300/40 text-cyan-100 text-xs sm:text-sm font-bold shadow-xl backdrop-blur-md flex items-center space-x-2"
          >
            <span className="animate-spin text-base">❄️</span>
            <span>Schneesturm entfesselt!</span>
            <span className="text-cyan-300 text-xs font-normal">(3 Sekunden Blizzard)</span>
          </motion.div>

          {/* Frosted Wind Swirl Line Details */}
          <div className="w-full flex justify-around opacity-30 select-none">
            <span className="text-4xl animate-pulse">🌬️</span>
            <span className="text-3xl animate-pulse delay-100">❄️</span>
            <span className="text-4xl animate-pulse delay-200">🌬️</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
