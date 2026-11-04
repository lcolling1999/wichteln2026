import React from 'react';
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
      className="relative flex flex-col items-center justify-center w-full max-w-sm sm:max-w-md mx-auto my-4 px-1"
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
                onClick={() => onOrbClick?.(colleague)}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
