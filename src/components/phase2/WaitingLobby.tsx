import React, { useState } from 'react';
import { Participant, DrawStatus } from '../../types';
import { TreeLobby } from './TreeLobby';
import { LiveCounter } from './LiveCounter';
import { PartyCountdown } from '../common/PartyCountdown';
import { PushToggleButton } from '../common/PushToggleButton';
import { AdminModal } from '../admin/AdminModal';
import { SecretWishlistNotepad } from '../eastereggs/SecretWishlistNotepad';
import { soundEngine } from '../../audio/soundEngine';

interface WaitingLobbyProps {
  participants: Participant[];
  status: DrawStatus | null;
  currentUserId?: number | null;
  onPhaseTransition?: () => void;
  onAdminOpen?: () => void;
  reducedMotion?: boolean;
}

export const WaitingLobby: React.FC<WaitingLobbyProps> = ({
  participants,
  status,
  currentUserId,
  onPhaseTransition,
  onAdminOpen,
  reducedMotion = false,
}) => {
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  const registeredCount =
    status?.registeredCount ?? participants.filter((p) => p.isRegistered).length;
  const isDrawn = status?.isDrawn ?? false;
  const totalParticipants = status?.totalParticipants ?? participants.length;

  const handleOrbClick = (_participant: Participant) => {
    soundEngine.playOrbPop();
  };

  const handleDrawSuccess = () => {
    setIsAdminOpen(false);
    onPhaseTransition?.();
  };

  return (
    <div
      data-testid="waiting-lobby"
      className="relative flex-1 flex flex-col items-center justify-between w-full max-w-lg mx-auto px-2 py-2 sm:py-4 gap-3"
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
          {isDrawn
            ? 'Die Auslosung ist durch! Öffne jetzt deinen Wichtel-Safe, um deinen Partner zu erfahren.'
            : `Warte, bis alle ${totalParticipants} Kollegen eingecheckt sind. Sobald die Auslosung startet, wird dein Safe versiegelt!`}
        </p>

        <LiveCounter registeredCount={registeredCount} totalParticipants={totalParticipants} />

        {/* Prominent Wishlist Button directly above the tree so it is always visible without scrolling */}
        <div className="flex justify-center pt-1">
          <button
            type="button"
            data-testid="lobby-wishlist-btn"
            onClick={() => setIsWishlistOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-amber-100 text-xs sm:text-sm font-semibold transition-colors shadow-md active:scale-95"
          >
            <span>📝</span>
            <span>Mein Wunschzettel</span>
          </button>
        </div>
      </div>

      {/* Interactive Christmas Tree */}
      <div className="w-full my-auto py-1">
        <TreeLobby
          participants={participants}
          currentUserId={currentUserId}
          onOrbClick={handleOrbClick}
          reducedMotion={reducedMotion}
        />
      </div>

      {/* Countdown to Christmas Party */}
      <PartyCountdown />

      {/* Optional Push Notifications Opt-In */}
      <PushToggleButton />

      {/* Footer Controls */}
      <div className="w-full flex items-center justify-end pt-3 border-t border-white/10 text-xs text-white/50 px-2">
        {isDrawn ? (
          <button
            type="button"
            onClick={onPhaseTransition}
            className="w-full sm:w-auto px-4 py-2 rounded-xl font-bold text-[#002752] bg-gradient-to-r from-[#F9AA2E] to-amber-300 shadow-lg animate-pulse"
          >
            Zum Wichtel-Safe 🔒
          </button>
        ) : (
          <button
            type="button"
            data-testid="admin-login-trigger"
            onClick={() => (onAdminOpen ? onAdminOpen() : setIsAdminOpen(true))}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-amber-300 transition-colors"
          >
            <span>🔐</span>
            <span>Admin</span>
          </button>
        )}
      </div>

      {/* Wishlist Modal Dialog in Lobby */}
      {isWishlistOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          onClick={() => setIsWishlistOpen(false)}
        >
          <div
            className="relative w-full max-w-lg p-5 rounded-3xl glass-card-gold border border-amber-400/40 shadow-2xl bg-gradient-to-b from-[#021f42] to-[#01142b]"
            onClick={(e) => e.stopPropagation()}
          >
            <SecretWishlistNotepad
              onFlipBack={() => setIsWishlistOpen(false)}
              closeLabel="Schließen ✕"
              isDrawn={isDrawn}
            />
          </div>
        </div>
      )}

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
