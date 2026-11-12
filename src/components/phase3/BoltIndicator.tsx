import React from 'react';
import { motion } from 'framer-motion';

export interface BoltIndicatorProps {
  index: number;
  isLocked: boolean;
  isCurrentTarget: boolean;
}

export const BoltIndicator: React.FC<BoltIndicatorProps> = ({
  index,
  isLocked,
  isCurrentTarget,
}) => {
  return (
    <div
      data-testid={`bolt-indicator-${index}`}
      className={`relative flex flex-col items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl border transition-all duration-300 ${
        isLocked
          ? 'bg-amber-950/40 border-amber-400/80 shadow-[0_0_15px_rgba(249,170,46,0.3)]'
          : isCurrentTarget
          ? 'bg-slate-800/80 border-amber-400/35'
          : 'bg-slate-900/60 border-slate-700/60'
      }`}
    >
      <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-slate-200 whitespace-nowrap">
        Bolzen {index + 1}
      </span>

      {/* Heavy Steel Bolt Pin */}
      <div className="relative w-9 h-2.5 rounded-sm bg-slate-950 overflow-hidden border border-slate-700/80">
        <motion.div
          initial={false}
          animate={{
            x: isLocked ? 0 : -24,
            backgroundColor: isLocked ? '#F9AA2E' : '#475569',
          }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="w-full h-full rounded-sm shadow-inner"
        />
      </div>

      {/* Status LED & Label */}
      <div className="flex items-center justify-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            isLocked
              ? 'bg-amber-400 shadow-[0_0_8px_#F9AA2E]'
              : isCurrentTarget
              ? 'bg-amber-400/70 animate-pulse'
              : 'bg-slate-600'
          }`}
        />
        <span className="text-[10px] font-semibold text-slate-300 whitespace-nowrap">
          {isLocked ? 'Eingerastet' : isCurrentTarget ? 'Aktiv' : 'Offen'}
        </span>
      </div>
    </div>
  );
};
