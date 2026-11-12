import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ColleagueSelector } from './ColleagueSelector';
import { BiometricRings } from './BiometricRings';
import { useWebAuthn } from '../../hooks/useWebAuthn';
import { Participant } from '../../types';
import { soundEngine } from '../../audio/soundEngine';

interface OnboardingCardProps {
  onSuccess: (participant: Participant) => void;
  onAdminOpen?: () => void;
  participants?: Participant[];
}

export const OnboardingCard: React.FC<OnboardingCardProps> = ({
  onSuccess,
  onAdminOpen,
  participants: externalParticipants,
}) => {
  const [colleagues, setColleagues] = useState<Participant[]>([]);
  const [selectedColleague, setSelectedColleague] = useState<Participant | null>(null);
  const [uiState, setUiState] = useState<'idle' | 'ceremony' | 'ascension' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  const {
    register,
    login,
    conditionalLogin,
    prefetchOptions,
    error: webAuthnError,
    clearError,
    isSupported,
  } = useWebAuthn();

  // Prefetch WebAuthn challenge options whenever selection changes (prevents iOS Safari gesture loss)
  useEffect(() => {
    if (selectedColleague) {
      prefetchOptions(selectedColleague.id, selectedColleague.isRegistered);
    }
  }, [selectedColleague?.id, selectedColleague?.isRegistered, prefetchOptions]);

  useEffect(() => {
    if (externalParticipants && externalParticipants.length > 0) {
      setColleagues(externalParticipants);
      setSelectedColleague((prev) => {
        if (!prev) return prev;
        return externalParticipants.find((c) => c.id === prev.id) || prev;
      });
    }
  }, [externalParticipants]);

  useEffect(() => {
    fetch('/api/participants')
      .then((res) => res.json())
      .then((data: Participant[]) => {
        setColleagues(data);
        const lastId = localStorage.getItem('wichteln_last_participant_id');
        if (lastId) {
          const match = data.find((c) => String(c.id) === lastId);
          if (match) setSelectedColleague(match);
        }
      })
      .catch((err) => console.error('Error fetching participants:', err));

    conditionalLogin().then((p) => {
      if (p) {
        handleAuthSuccess(p);
      }
    });
  }, [conditionalLogin]);

  const handleAuthSuccess = (participant: Participant) => {
    soundEngine.playBiometricSnap();
    setUiState('ascension');
    setStatusMessage(`Willkommen, ${participant.displayName || participant.name}! 🌟`);

    // Complete ascension animation (1.2s) before passing control to Phase 2 Lobby
    setTimeout(() => {
      onSuccess(participant);
    }, 1200);
  };

  const handleRegister = async () => {
    if (!selectedColleague) return;
    clearError();
    setUiState('ceremony');
    setStatusMessage(`Erstelle Passkey für ${selectedColleague.displayName || selectedColleague.name}...`);

    try {
      const p = await register(selectedColleague.id);
      handleAuthSuccess(p);
    } catch {
      setUiState('idle');
    }
  };

  const handleLogin = async () => {
    clearError();
    setUiState('ceremony');
    setStatusMessage('Bestätige deinen Passkey...');

    try {
      const p = await login(selectedColleague?.id);
      handleAuthSuccess(p);
    } catch {
      setUiState('idle');
    }
  };

  return (
    <div
      data-testid="onboarding-card"
      className="relative w-full max-w-lg mx-auto overflow-hidden rounded-3xl bg-[#004891]/30 backdrop-blur-2xl border border-white/20 p-6 sm:p-8 shadow-2xl text-white transition-all duration-300"
    >
      {/* Decorative Golden Star Accent in Card Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl sm:text-2xl shrink-0" role="img" aria-label="Weihnachtsbaum">🎄</span>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white leading-snug">
            Wichteln der Kollegen
          </h1>
        </div>
        <span className="shrink-0 whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-[#F9AA2E]/20 text-[#F9AA2E] border border-[#F9AA2E]/40">
          2026 Edition
        </span>
      </div>

      <AnimatePresence mode="wait">
        {uiState === 'ascension' ? (
          /* Star / Orb Ascension Choreography */
          <motion.div
            key="ascension"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-12"
          >
            {/* The Ascending Golden Star/Orb */}
            <motion.div
              initial={{ scale: 0.2, opacity: 0, y: 0 }}
              animate={{
                scale: [0.2, 1.4, 0.6],
                opacity: [0, 1, 0.85],
                y: [0, -40, -420],
              }}
              transition={{
                duration: 1.1,
                times: [0, 0.25, 1],
                ease: [0.25, 1, 0.5, 1],
              }}
              className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-[#F9AA2E] via-amber-300 to-yellow-100 flex items-center justify-center shadow-[0_0_40px_rgba(249,170,46,0.9)]"
            >
              <span className="text-2xl">⭐</span>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg font-medium text-amber-200 mt-6"
            >
              {statusMessage}
            </motion.p>
            <p className="text-xs text-white/60 mt-1">Betrete die Warte-Lobby...</p>
          </motion.div>
        ) : uiState === 'ceremony' ? (
          /* Biometric Concentric Rings ceremony */
          <motion.div
            key="ceremony"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center py-4"
          >
            <BiometricRings
              state="scanning"
              participantName={selectedColleague?.displayName || selectedColleague?.name}
            />
            <p className="text-xs text-white/60 mt-4">{statusMessage}</p>

            <button
              type="button"
              onClick={() => setUiState('idle')}
              className="mt-6 text-xs text-white/50 hover:text-white underline underline-offset-4"
            >
              Abbrechen
            </button>
          </motion.div>
        ) : (
          /* Default / Idle Onboarding Form */
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            <p className="text-sm text-white/80 text-center leading-relaxed">
              Wähle deinen Namen aus der Kollegenliste und melde dich sicher ohne Passwort per
              Passkey an.
            </p>

            {/* Error feedback banner with graceful dismissal */}
            {webAuthnError && (
              <div className="p-3.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs flex items-start justify-between">
                <span>{webAuthnError}</span>
                <button
                  type="button"
                  onClick={clearError}
                  className="ml-2 font-bold hover:text-white"
                >
                  ✕
                </button>
              </div>
            )}

            {!isSupported && (
              <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs">
                ⚠️ Dein Browser unterstützt Passkeys nicht direkt. Bitte nutze einen aktuellen
                Chromium-, Safari- oder Firefox-Browser.
              </div>
            )}

            {/* Colleague Selector */}
            <ColleagueSelector
              colleagues={colleagues}
              selectedId={selectedColleague?.id ?? null}
              onSelect={setSelectedColleague}
            />

            {/* Primary Action Buttons */}
            <div className="space-y-3 pt-2">
              {selectedColleague && !selectedColleague.isRegistered ? (
                <button
                  type="button"
                  data-testid="register-btn"
                  onClick={handleRegister}
                  className="w-full py-3.5 px-5 rounded-xl font-semibold text-[#002752] bg-gradient-to-r from-[#F9AA2E] to-amber-400 hover:from-amber-400 hover:to-amber-300 shadow-lg shadow-[#F9AA2E]/25 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
                >
                  <span>Passkey anlegen &amp; Beitreten</span>
                  <span aria-hidden="true">🔑</span>
                </button>
              ) : selectedColleague && selectedColleague.isRegistered ? (
                <button
                  type="button"
                  data-testid="login-btn"
                  onClick={handleLogin}
                  className="w-full py-3.5 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-lg shadow-emerald-500/25 transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  <span>Mit Passkey einloggen ({selectedColleague.displayName || selectedColleague.name})</span>
                  <span>🔑</span>
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="login-btn"
                  onClick={handleLogin}
                  className="w-full py-3.5 px-6 rounded-xl font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  <span>Bereits registriert? Direkt einloggen</span>
                  <span>🔑</span>
                </button>
              )}
            </div>

            {/* Admin Access Link in Footer */}
            {onAdminOpen && (
              <div className="pt-4 border-t border-white/10 text-center">
                <button
                  type="button"
                  data-testid="admin-login-trigger"
                  onClick={onAdminOpen}
                  className="text-xs text-white/40 hover:text-amber-300 transition-colors"
                >
                  Organisator-Bereich (Admin PIN)
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
