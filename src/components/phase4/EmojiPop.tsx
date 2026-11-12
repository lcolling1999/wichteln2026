import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { soundEngine } from '../../audio/soundEngine';
import { vibrateTick } from '../../hooks/useHaptics';
import { Keyword } from '../../types';

interface Particle {
  id: string;
  emoji: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  rotation: number;
}

export interface EmojiPopChipProps {
  index: number;
  keyword: Keyword;
}

export const EmojiPopChip: React.FC<EmojiPopChipProps> = ({ index, keyword }) => {
  const [particles, setParticles] = useState<Particle[]>([]);

  const handlePop = (e: React.MouseEvent<HTMLButtonElement>) => {
    soundEngine.playEmojiPop();
    vibrateTick();

    const rect = e.currentTarget.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    const count = 8;
    const newParticles: Particle[] = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * 2 * Math.PI + (Math.random() - 0.5) * 0.4;
      const distance = 45 + Math.random() * 35;
      return {
        id: `${Date.now()}-${i}-${Math.random()}`,
        emoji: keyword.emoji,
        startX: originX,
        startY: originY,
        targetX: Math.cos(angle) * distance,
        targetY: Math.sin(angle) * distance,
        rotation: (Math.random() - 0.5) * 60,
      };
    });

    setParticles((prev) => [...prev, ...newParticles]);

    setTimeout(() => {
      setParticles((prev) =>
        prev.filter((p) => !newParticles.some((np) => np.id === p.id))
      );
    }, 750);
  };

  const particleLayer = (
    <AnimatePresence>
      {particles.map((p) => (
        <motion.span
          key={p.id}
          data-testid="emoji-particle"
          className="emoji-pop-particle fixed pointer-events-none select-none z-50 text-xl -translate-x-1/2 -translate-y-1/2"
          style={{ left: p.startX, top: p.startY, marginLeft: '-0.5em', marginTop: '-0.5em' }}
          initial={{ scale: 0.4, opacity: 1, x: 0, y: 0, rotate: 0 }}
          animate={{
            scale: [0.4, 1.3, 0.8],
            opacity: [1, 1, 0],
            x: p.targetX,
            y: p.targetY,
            rotate: p.rotation,
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          {p.emoji}
        </motion.span>
      ))}
    </AnimatePresence>
  );

  return (
    <>
      <button
        type="button"
        data-testid={`keyword-chip-${index}`}
        onClick={handlePop}
        className="relative group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400/15 hover:bg-amber-400/30 border border-amber-300/40 hover:border-amber-300/70 text-amber-200 text-sm font-semibold transition-all duration-200 shadow-sm hover:shadow-[0_0_15px_rgba(249,170,46,0.4)] cursor-pointer select-none active:scale-95"
      >
        <span className="text-base select-none">{keyword.emoji}</span>
        <span className="font-medium text-amber-100">{keyword.word}</span>
      </button>

      {/* Render Particles via Portal on document.body so CSS transform on HolographicCard does not offset fixed coordinates */}
      {typeof document !== 'undefined' ? createPortal(particleLayer, document.body) : particleLayer}
    </>
  );
};
