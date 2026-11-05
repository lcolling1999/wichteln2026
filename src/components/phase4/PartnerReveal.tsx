import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { HolographicCard } from './HolographicCard';
import { MatrixScrambleText } from './MatrixScrambleText';
import { TeaserSentence } from './TeaserSentence';
import { EmojiPopChip } from './EmojiPop';
import { SecretWishlistNotepad } from '../eastereggs/SecretWishlistNotepad';
import { hasSeenReveal, markRevealSeen } from '../../utils/vaultStorage';
import { AssignmentData, Participant } from '../../types';

export interface PartnerRevealProps {
  currentUser?: Participant | null;
  onBackToLobby?: () => void;
  initialAssignment?: AssignmentData | null;
  /** Verification hash of the draw - used to remember per draw that the reveal was already shown */
  drawHash?: string | null;
}

export const PartnerReveal: React.FC<PartnerRevealProps> = ({
  currentUser,
  onBackToLobby,
  initialAssignment,
  drawHash,
}) => {
  const [data, setData] = useState<AssignmentData | null>(initialAssignment ?? null);
  const [loading, setLoading] = useState<boolean>(!initialAssignment);
  const [error, setError] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);

  // The big reveal (decryption + confetti + chime) is played exactly once per device and draw.
  // On later visits the card is shown calm and static. Evaluated once on mount.
  const [playRevealAnimation] = useState<boolean>(() =>
    currentUser ? !hasSeenReveal(currentUser.id, drawHash) : true
  );

  const fetchAssignment = () => {
    setLoading(true);
    setError(null);
    fetch('/api/me/assignment', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            throw new Error('UNAUTHORIZED');
          }
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || 'Fehler beim Laden der Zuweisung');
        }
        return res.json();
      })
      .then((assignment: AssignmentData) => {
        setData(assignment);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!initialAssignment) {
      fetchAssignment();
    }
  }, [initialAssignment]);

  const handleScrambleComplete = useCallback(() => {
    setIsRevealed(true);
    if (currentUser) markRevealSeen(currentUser.id, drawHash);
    // Chime is already played by MatrixScrambleText itself - only the confetti is added here
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#004891', '#F9AA2E', '#ffffff', '#fbbf24'],
      });
    } catch {
      // Graceful degradation if canvas context restricted
    }
  }, [currentUser, drawHash]);

  if (loading) {
    return (
      <div
        data-testid="partner-reveal-container"
        className="w-full max-w-md mx-auto p-8 rounded-3xl glass-card border border-white/20 text-center space-y-4 my-8 text-white shadow-2xl animate-pulse"
      >
        <div className="text-4xl animate-bounce">🎁</div>
        <h3 className="text-xl font-bold text-amber-300">Entschlüssele Zuweisung...</h3>
        <p className="text-sm text-slate-300">Einen Moment, die geheime Botschaft wird geladen.</p>
      </div>
    );
  }

  if (error === 'UNAUTHORIZED') {
    return (
      <div
        data-testid="partner-reveal-container"
        className="w-full max-w-md mx-auto p-6 rounded-3xl glass-card border border-red-500/40 text-center space-y-4 my-8 text-white shadow-2xl"
      >
        <span className="text-4xl">🔒</span>
        <h3 className="text-xl font-bold text-amber-300">Anmeldung erforderlich</h3>
        <p className="text-sm text-slate-300">
          Bitte melde dich per Passkey an, um deinen Partner zu sehen.
        </p>
        {onBackToLobby && (
          <button
            type="button"
            onClick={onBackToLobby}
            className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 transition-colors cursor-pointer"
          >
            Zurück zur Übersicht
          </button>
        )}
      </div>
    );
  }

  if (error || !data || !data.isDrawn || !data.partner) {
    return (
      <div
        data-testid="partner-reveal-container"
        className="w-full max-w-md mx-auto p-6 rounded-3xl glass-card border border-white/20 text-center space-y-4 my-8 text-white shadow-2xl"
      >
        <span className="text-4xl">⏳</span>
        <h3 className="text-xl font-bold text-amber-300">Auslosung noch offen</h3>
        <p className="text-sm text-slate-300">
          {error || 'Die Wichtel-Auslosung hat noch nicht stattgefunden.'}
        </p>
        <button
          type="button"
          onClick={fetchAssignment}
          className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 transition-colors cursor-pointer"
        >
          Erneut prüfen
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="partner-reveal-container"
      className="w-full max-w-lg mx-auto p-4 flex flex-col items-center select-none"
    >
      <HolographicCard
        className="w-full text-center"
        backContent={
          <SecretWishlistNotepad
            partnerName={data.partner.displayName || data.partner.name}
          />
        }
      >
        {/* Festive Header Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-xs uppercase tracking-widest font-black mb-3">
          <span>🎄</span>
          <span>Dein Wichtelpartner</span>
          <span>✨</span>
        </div>

        {/* Matrix Scramble Decryption (first time only - static afterwards) */}
        <MatrixScrambleText
          targetText={data.partner.displayName || data.partner.name}
          durationMs={2400}
          animate={playRevealAnimation}
          onComplete={handleScrambleComplete}
        />

        {/* Word-by-Word 3D Blur-to-Focus Teaser Sentence */}
        {data.teaser && (
          <TeaserSentence
            sentence={data.teaser.sentence}
            keywords={data.teaser.keywords}
            isVisible={true}
            animate={playRevealAnimation}
          />
        )}

        {/* Interactive Keyword Chips with Emoji-Plopp */}
        {data.teaser?.keywords && data.teaser.keywords.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4 pt-3 border-t border-white/10">
            {data.teaser.keywords.map((kw, idx) => (
              <EmojiPopChip key={idx} index={idx} keyword={kw} />
            ))}
          </div>
        )}

        {/* Subtle Hint for Wishlist Flip on Back */}
        <div className="mt-4 pt-2 flex items-center justify-center text-slate-400 text-xs gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
          <span>📝</span>
          <span>Tippe 3× auf die Karte für den geheimen Wunschzettel</span>
        </div>
      </HolographicCard>
    </div>
  );
};
