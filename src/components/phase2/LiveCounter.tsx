import React from 'react';

interface LiveCounterProps {
  registeredCount: number;
  totalParticipants?: number;
}

export const LiveCounter: React.FC<LiveCounterProps> = ({
  registeredCount,
  totalParticipants = 24,
}) => {
  const percentage = Math.min(100, Math.round((registeredCount / totalParticipants) * 100));

  return (
    <div
      data-testid="lobby-counter"
      className="w-full max-w-sm mx-auto flex flex-col items-center glass-card px-4 py-3 border border-amber-400/30 shadow-[0_0_20px_rgba(249,170,46,0.18)]"
    >
      <div className="flex items-center space-x-2.5">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F9AA2E] opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[#F9AA2E]" />
        </span>
        <span
          data-testid="checkin-counter"
          className="text-sm sm:text-base font-semibold text-slate-100"
        >
          <span className="text-[#F9AA2E] font-bold text-base sm:text-lg">{registeredCount}</span> von {totalParticipants} Kollegen eingecheckt
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-[#001932]/70 h-2 rounded-full mt-2.5 overflow-hidden border border-white/10">
        <div
          className="bg-gradient-to-r from-amber-400 to-[#F9AA2E] h-full transition-all duration-500 rounded-full shadow-[0_0_10px_#F9AA2E]"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
