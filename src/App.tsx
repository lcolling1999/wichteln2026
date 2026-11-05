import React, { useState, useEffect } from 'react';
import { ParticlesCanvas } from './components/common/ParticlesCanvas';
import { Header } from './components/common/Header';
import { OnboardingCard } from './components/phase1/OnboardingCard';
import { WaitingLobby } from './components/phase2/WaitingLobby';
import { SafeVaultContainer } from './components/phase3/SafeVaultContainer';
import { PartnerReveal } from './components/phase4/PartnerReveal';
import { AdminModal } from './components/admin/AdminModal';
import { SnowstormOverlay } from './components/eastereggs/SnowstormOverlay';
import { GrinchOverlay } from './components/eastereggs/GrinchOverlay';
import { useLobbyPoll } from './hooks/useLobbyPoll';
import { useShake } from './hooks/useShake';
import { soundEngine } from './audio/soundEngine';
import { isVaultUnlocked, markVaultUnlocked } from './utils/vaultStorage';
import { AppPhase, Participant } from './types';

export const App: React.FC = () => {
  const [phase, setPhase] = useState<AppPhase>('phase1_onboarding');
  const [currentUser, setCurrentUser] = useState<Participant | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(() => soundEngine.getMuted());
  const [isAdminModalOpen, setIsAdminModalOpen] = useState<boolean>(false);

  // Easter Egg 1: Shake Detection Hook for 3s Blizzard
  const { isBlizzard } = useShake({ durationMs: 3000 });

  // Status and participants polling
  const { status, participants, refetch } = useLobbyPoll({
    baseIntervalMs: 3500,
    onDrawComplete: () => {
      soundEngine.playRevealChime();
      // Guard: Only advance if the user is currently in the lobby (authenticated)
      setPhase((prevPhase) => {
        if (prevPhase === 'phase2_lobby') {
          return 'phase3_safedial';
        }
        return prevPhase;
      });
    },
  });

  // Check initial user authentication via /api/auth/me
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.participant) {
          setCurrentUser(data.participant);
          if (status?.isDrawn) {
            const alreadyUnlocked = isVaultUnlocked(data.participant.id, status?.verificationHash);
            setPhase(alreadyUnlocked ? 'phase4_reveal' : 'phase3_safedial');
          } else {
            setPhase('phase2_lobby');
          }
        }
      })
      .catch(() => {});
  }, [status?.isDrawn, status?.verificationHash]);

  // First user interaction initializes AudioContext without unhandled rejections (TC-F9-01, TC-F9-05)
  useEffect(() => {
    const handleFirstGesture = () => {
      soundEngine.ensureContext();
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };

    window.addEventListener('click', handleFirstGesture, { passive: true });
    window.addEventListener('touchstart', handleFirstGesture, { passive: true });
    window.addEventListener('pointerdown', handleFirstGesture, { passive: true });
    window.addEventListener('keydown', handleFirstGesture, { passive: true });

    return () => {
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, []);

  const handleToggleMute = () => {
    const nextMuted = soundEngine.toggleMute();
    setIsMuted(nextMuted);
  };

  const handleAuthSuccess = (participant: Participant) => {
    setCurrentUser(participant);
    refetch();
    if (status?.isDrawn) {
      const alreadyUnlocked = isVaultUnlocked(participant.id, status?.verificationHash);
      setPhase(alreadyUnlocked ? 'phase4_reveal' : 'phase3_safedial');
    } else {
      setPhase('phase2_lobby');
    }
  };

  return (
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden flex flex-col justify-between selection:bg-amber-400/30">
      {/* Canvas Snow Particle Engine (60 FPS, Object Pool, DPR Clamping) with Blizzard Scaling */}
      <ParticlesCanvas isBlizzard={isBlizzard} />

      {/* Easter Egg 1: Frosted Blizzard Overlay and Banner */}
      <SnowstormOverlay isBlizzard={isBlizzard} />

      {/* Top Header with Brand, Rudolph Avatar, and Audio Mute Control */}
      <Header
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onAdminOpen={() => setIsAdminModalOpen(true)}
        showAdmin={true}
        currentUser={currentUser}
      />

      {/* Main Phase Container */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-2 py-4 w-full max-w-full">
        {phase === 'phase1_onboarding' && (
          <OnboardingCard
            onSuccess={handleAuthSuccess}
            onAdminOpen={() => setIsAdminModalOpen(true)}
            participants={participants}
          />
        )}

        {phase === 'phase2_lobby' && (
          <WaitingLobby
            participants={participants}
            status={status}
            currentUserId={currentUser?.id ?? null}
            onPhaseTransition={() => setPhase('phase3_safedial')}
          />
        )}

        {phase === 'phase3_safedial' && (
          <SafeVaultContainer
            onUnlock={() => {
              if (currentUser) {
                markVaultUnlocked(currentUser.id, status?.verificationHash);
              }
              setPhase('phase4_reveal');
            }}
          />
        )}

        {phase === 'phase4_reveal' && (
          <PartnerReveal
            currentUser={currentUser}
            drawHash={status?.verificationHash}
            onBackToLobby={() => setPhase('phase2_lobby')}
          />
        )}
      </main>

      {/* Admin Modal Dialog */}
      <AdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onDrawTriggered={() => {
          setIsAdminModalOpen(false);
          refetch();
          setPhase((prevPhase) => {
            if (prevPhase === 'phase2_lobby') {
              return 'phase3_safedial';
            }
            return prevPhase;
          });
        }}
        onParticipantReset={(resetParticipantId) => {
          refetch();
          if (currentUser && currentUser.id === resetParticipantId) {
            setCurrentUser(null);
            setPhase('phase1_onboarding');
          }
        }}
        status={status}
        participants={participants}
      />

      {/* Easter Egg 4: Global Grinch Overscroll Pull-Down Overlay */}
      <GrinchOverlay />
    </div>
  );
};

export default App;
