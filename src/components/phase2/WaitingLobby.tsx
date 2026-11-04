import React, { useState } from 'react';
import { Participant, DrawStatus } from '../../types';
import { TreeLobby } from './TreeLobby';
import { LiveCounter } from './LiveCounter';
import { AdminModal } from '../admin/AdminModal';
import { soundEngine } from '../../audio/soundEngine';

interface WaitingLobbyProps {
  participants: Participant[];
  status: DrawStatus | null;
  currentUserId?: number | null;
  onPhaseTransition?: () => void;
  reducedMotion?: boolean;
}

export const WaitingLobby: React.FC<WaitingLobbyProps> = ({
  participants,
  status,
  currentUserId,
  onPhaseTransition,
  reducedMotion = false,
}) => {
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  const registeredCount =
    status?.registeredCount ?? participants.filter((p) => p.isRegistered).length;
  const isDrawn = status?.isDrawn ?? false;

  const handleOrbClick = (_participant: Participant) => {
    soundEngine.playOrbPop();
  };

  const handleDrawSuccess = () => {
    soundEngine.playRevealChime();
    setIsAdminOpen(false);
    onPhaseTransition?.();
  };

  return (
    <div
      data-testid="waiting-lobby"
      className="relative flex flex-col items-center justify-between w-full max-w-lg mx-auto min-h-[calc(100vh-5rem)] px-2 py-4"
    >
      {/* Lobby Header & Live Counter */}
      <div className="w-full space-y-3 text-center">
        <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center justify-center space-x-2">
          <span>🎄</span>
          <span className="bg-gradient-to-r from-white via-amber-100 to-amber-300 bg-clip-text text-transparent">
            Wichtel-Lobby
          </span>
          <span>🎄</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-300">
          Warte, bis alle 24 Kollegen eingecheckt sind. Sobald die Auslosung startet, wird dein
          Safe versiegelt!
        </p>

        <LiveCounter registeredCount={registeredCount} totalParticipants={24} />
      </div>

      {/* Interactive Christmas Tree */}
      <div className="w-full my-auto py-2">
        <TreeLobby
          participants={participants}
          currentUserId={currentUserId}
          onOrbClick={handleOrbClick}
          reducedMotion={reducedMotion}
        />
      </div>

      {/* Footer Controls with Admin Button */}
      <div className="w-full flex items-center justify-between pt-4 border-t border-white/10 text-xs text-white/50 px-2">
        <span>Wichteln 2026</span>

        {isDrawn ? (
          <button
            type="button"
            onClick={onPhaseTransition}
            className="px-4 py-2 rounded-xl font-bold text-[#002752] bg-gradient-to-r from-[#F9AA2E] to-amber-300 shadow-lg animate-pulse"
          >
            Zum Wichtel-Safe 🔒
          </button>
        ) : (
          <button
            type="button"
            data-testid="admin-login-trigger"
            onClick={() => setIsAdminOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-amber-300 transition-colors"
          >
            <span>🔐</span>
            <span>Admin</span>
          </button>
        )}
      </div>

      {/* Admin Modal */}
      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        onDrawTriggered={handleDrawSuccess}
        status={status}
        participants={participants}
      />
    </div>
  );
};
