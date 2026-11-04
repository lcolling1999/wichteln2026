import React, { useState } from 'react';
import { soundEngine } from '../../audio/soundEngine';

interface SafePlaceholderProps {
  onUnlock?: () => void;
}

export const SafePlaceholder: React.FC<SafePlaceholderProps> = ({ onUnlock }) => {
  const [ticks, setTicks] = useState(0);

  const handleClick = () => {
    soundEngine.playSafeTick();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(5);
      } catch {
        // safe degradation
      }
    }
    const nextTicks = ticks + 1;
    setTicks(nextTicks);
    if (nextTicks >= 3) {
      soundEngine.playBoltLock();
      onUnlock?.();
    }
  };

  return (
    <div
      data-testid="safe-reveal-container"
      className="relative flex flex-col items-center justify-center w-full max-w-md mx-auto p-6 rounded-3xl glass-card border border-white/20 text-white my-8 shadow-2xl"
    >
      <div data-testid="safe-vault" className="text-center space-y-3">
        <span className="text-4xl">🔐</span>
        <h2 className="text-xl font-bold tracking-tight">Wichtel-Tresor ist versiegelt!</h2>
        <p className="text-xs text-slate-300">
          Die Wichtel-Auslosung ist abgeschlossen. Drehe am Safe-Drehknauf, um deinen Wichtelpartner zu enthüllen!
        </p>

        {/* Rotary Dial Dial Element */}
        <div className="py-6 flex justify-center">
          <button
            type="button"
            data-testid="safe-rotary-dial"
            onClick={handleClick}
            className="w-36 h-36 rounded-full bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-700 border-4 border-amber-400/80 shadow-[0_0_30px_rgba(249,170,46,0.4)] flex flex-col items-center justify-center transform active:scale-95 transition-transform cursor-pointer select-none"
          >
            <div className="w-24 h-24 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center">
              <span className="text-amber-300 font-bold text-xs tracking-wider">
                {ticks >= 3 ? 'OFFEN 🔓' : `DREHEN (${ticks}/3)`}
              </span>
            </div>
          </button>
        </div>

        <p className="text-[11px] text-amber-200/70">
          (Phase 3 Vorbereitung — Tippe 3x auf das Zifferblatt zum Entriegeln)
        </p>
      </div>
    </div>
  );
};
