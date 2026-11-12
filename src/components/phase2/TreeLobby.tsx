import React, { useState, useEffect } from 'react';
import { Participant } from '../../types';
import { ColleagueOrb } from './ColleagueOrb';

interface TreeLobbyProps {
  participants: Participant[];
  currentUserId?: number | null;
  onOrbClick?: (participant: Participant) => void;
  reducedMotion?: boolean;
}

export const TreeLobby: React.FC<TreeLobbyProps> = ({
  participants,
  currentUserId,
  onOrbClick,
  reducedMotion = false,
}) => {
  const [activeOrbId, setActiveOrbId] = useState<number | null>(null);

  // Close open tooltip when tapping outside any colleague orb
  useEffect(() => {
    if (activeOrbId === null) return;
    const handleOutsidePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[data-testid^="colleague-orb-"]')) {
        setActiveOrbId(null);
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [activeOrbId]);

  // Balanced 24-colleague tree geometry: 1 + 2 + 3 + 4 + 5 + 5 + 4 = 24
  const tierDistribution = [1, 2, 3, 4, 5, 5, 4];

  let pIndex = 0;
  const tiers: Participant[][] = tierDistribution.map((size) => {
    const tier = participants.slice(pIndex, pIndex + size);
    pIndex += size;
    return tier;
  });

  return (
    <div
      data-testid="lobby-tree"
      className="relative flex flex-col items-center justify-center w-full max-w-sm sm:max-w-md mx-auto my-2 px-1"
    >
      {/* Decorative Tree Apex Golden Star */}
      <div className="text-2xl sm:text-3xl text-[#F9AA2E] filter drop-shadow-[0_0_12px_#F9AA2E] animate-pulse mb-1 select-none">
        ⭐
      </div>

      {/* Christmas Tree Tiers Container */}
      <div className="flex flex-col items-center justify-center space-y-2 sm:space-y-3.5 w-full">
        {tiers.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className={`flex items-center justify-center gap-1.5 sm:gap-3 flex-nowrap ${
              rowIndex === tiers.length - 1 ? 'pt-1 border-t border-white/10' : ''
            }`}
          >
            {row.map((colleague) => (
              <ColleagueOrb
                key={colleague.id}
                participant={colleague}
                isCurrentUser={colleague.id === currentUserId}
                isTooltipOpen={activeOrbId === colleague.id}
                onClick={() => {
                  setActiveOrbId((prev) => (prev === colleague.id ? null : colleague.id));
                  onOrbClick?.(colleague);
                }}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
