import React, { useState, useEffect } from 'react';
import { ParticlesCanvas } from './components/common/ParticlesCanvas';
import { Header } from './components/common/Header';
import { OnboardingCard } from './components/phase1/OnboardingCard';
import { WaitingLobby } from './components/phase2/WaitingLobby';
import { SafePlaceholder } from './components/phase3/SafePlaceholder';
import { AdminModal } from './components/admin/AdminModal';
import { useLobbyPoll } from './hooks/useLobbyPoll';
import { soundEngine } from './audio/soundEngine';
import { AppPhase, Participant } from './types';

export const App: React.FC = () => {
  const [phase, setPhase] = useState<AppPhase>('phase1_onboarding');
  const [currentUser, setCurrentUser] = useState<Participant | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState<boolean>(false);

  // Status and participants polling
  const { status, participants, refetch } = useLobbyPoll({
    baseIntervalMs: 3500,
    onDrawComplete: () => {
      soundEngine.playRevealChime();
      setPhase('phase3_safedial');
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
            setPhase('phase3_safedial');
          } else {
            setPhase('phase2_lobby');
          }
        }
      })
      .catch(() => {});
  }, [status?.isDrawn]);

  // First user interaction initializes AudioContext (TC-F9-01)
  useEffect(() => {
    const handleFirstGesture = () => {
      soundEngine.getContext();
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };

    window.addEventListener('click', handleFirstGesture);
    window.addEventListener('touchstart', handleFirstGesture);

    return () => {
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
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
      setPhase('phase3_safedial');
    } else {
      setPhase('phase2_lobby');
    }
  };

  return (
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden flex flex-col justify-between selection:bg-amber-400/30">
      {/* Canvas Snow Particle Engine (60 FPS, Object Pool, DPR Clamping) */}
      <ParticlesCanvas />

      {/* Top Header with Brand and Audio Mute Control */}
      <Header
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onAdminOpen={() => setIsAdminModalOpen(true)}
        showAdmin={phase === 'phase1_onboarding'}
      />

      {/* Main Phase Container */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-2 py-4 w-full max-w-full">
        {phase === 'phase1_onboarding' && (
          <OnboardingCard
            onSuccess={handleAuthSuccess}
            onAdminOpen={() => setIsAdminModalOpen(true)}
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
          <SafePlaceholder onUnlock={() => setPhase('phase4_reveal')} />
        )}

        {phase === 'phase4_reveal' && (
          <div
            data-testid="partner-reveal-container"
            className="w-full max-w-md mx-auto p-6 rounded-3xl glass-card border border-white/20 text-center space-y-4 my-8 text-white shadow-2xl"
          >
            <span className="text-4xl">🎉</span>
            <h2 className="text-2xl font-black text-amber-300">Dein Wichtelpartner</h2>
            <p className="text-sm text-slate-200">
              Vorbereitung für Enthüllungs-Phase (Milestone 3).
            </p>
          </div>
        )}
      </main>

      {/* Admin Modal Dialog */}
      <AdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onDrawTriggered={() => {
          setIsAdminModalOpen(false);
          refetch();
          setPhase('phase3_safedial');
        }}
        status={status}
        participants={participants}
      />
    </div>
  );
};

export default App;
