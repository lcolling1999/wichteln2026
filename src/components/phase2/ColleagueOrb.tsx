import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Participant } from '../../types';
import { soundEngine } from '../../audio/soundEngine';
import { RudolphAvatar } from '../eastereggs/RudolphAvatar';

interface ColleagueOrbProps {
  participant: Participant;
  isCurrentUser?: boolean;
  onClick?: () => void;
  reducedMotion?: boolean;
}

export const ColleagueOrb: React.FC<ColleagueOrbProps> = ({
  participant,
  isCurrentUser = false,
  onClick,
  reducedMotion = false,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isRegistered = participant.isRegistered;

  const handleClick = () => {
    soundEngine.playOrbPop();
    setShowTooltip((prev) => !prev);
    onClick?.();
  };

  const initials = (participant.displayName || participant.name).slice(0, 2).toUpperCase();

  const orbButton = (
    <motion.button
      type="button"
      data-testid={`colleague-orb-${participant.id}`}
        aria-label={`${participant.displayName || participant.name}${isRegistered ? ' (Eingecheckt)' : ' (Wartet)'}`}
        whileHover={reducedMotion ? {} : { scale: 1.22, y: -4 }}
        whileTap={reducedMotion ? {} : { scale: 0.92, y: 2 }}
        transition={{
          type: 'spring',
          stiffness: 420,
          damping: 18,
          mass: 0.8,
        }}
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`colleague-orb relative group flex flex-col items-center justify-center rounded-full transition-colors duration-300 focus:outline-none select-none ${
          isRegistered
            ? 'gold registered text-amber-950 border-2 border-amber-300/80'
            : 'text-slate-300 border border-white/25 bg-white/10 backdrop-blur-md hover:bg-white/20'
        } ${isCurrentUser ? 'ring-4 ring-[#F9AA2E] ring-offset-2 ring-offset-[#00254b]' : ''} w-10 h-10 sm:w-12 sm:h-12 md:w-12 md:h-12`}
        style={{
          backgroundColor: isRegistered ? '#F9AA2E' : 'rgba(255, 255, 255, 0.12)',
          boxShadow: isRegistered
            ? '0 0 16px #F9AA2E, 0 0 32px rgba(249, 170, 46, 0.45)'
            : '0 4px 12px rgba(0, 0, 0, 0.35)',
          color: isRegistered ? '#00254b' : '#ffffff',
        }}
      >
        {/* Center Initials */}
        <span className="text-xs sm:text-sm font-extrabold tracking-tight">
          {initials}
        </span>

        {/* Current user badge */}
        {isCurrentUser && (
          <span className="absolute -top-2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#F9AA2E] text-[#00254b] shadow-sm">
            DU
          </span>
        )}

        {/* Pulse ring for registered colleague orbs */}
        {isRegistered && !reducedMotion && (
          <span className="absolute -inset-1 rounded-full border border-amber-300/60 animate-ping pointer-events-none opacity-25" />
        )}
      </motion.button>
  );

  return (
    <div className="relative flex items-center justify-center">
      {isCurrentUser ? (
        <RudolphAvatar
          isCurrentUser={true}
          displayName={participant.displayName || participant.name}
          testId="my-avatar"
        >
          {orbButton}
        </RudolphAvatar>
      ) : (
        orbButton
      )}

      {/* Tooltip on Hover or Tap */}
      {showTooltip && (
        <div className="pointer-events-none absolute bottom-full mb-2 z-30 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap bg-[#001932]/95 text-white border border-white/20 shadow-xl backdrop-blur-md">
          <div className="flex items-center space-x-1">
            <span>{participant.displayName || participant.name}</span>
            {isRegistered ? (
              <span className="text-amber-400 font-bold">✓ (Eingecheckt)</span>
            ) : (
              <span className="text-slate-400">(Wartet noch...)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
