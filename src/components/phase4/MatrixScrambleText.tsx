import React, { useState, useEffect, useRef } from 'react';
import { soundEngine } from '../../audio/soundEngine';

export const MATRIX_GLYPHS =
  'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#%@*&!?';

export interface MatrixScrambleTextProps {
  targetText: string;
  durationMs?: number;
  onComplete?: () => void;
  className?: string;
  /** When false the name is shown immediately (no decryption animation, no sound) */
  animate?: boolean;
}

export const MatrixScrambleText: React.FC<MatrixScrambleTextProps> = ({
  targetText,
  durationMs = 2400,
  onComplete,
  className = '',
  animate = true,
}) => {
  const characters = Array.from(targetText);
  const length = characters.length;

  const getRandomGlyph = () =>
    MATRIX_GLYPHS[Math.floor(Math.random() * MATRIX_GLYPHS.length)];

  const [displayText, setDisplayText] = useState<string>(() =>
    animate
      ? characters.map((char) => (char === ' ' ? ' ' : getRandomGlyph())).join('')
      : targetText
  );
  const [settledCount, setSettledCount] = useState<number>(animate ? 0 : length);
  const lastSettledRef = useRef<number>(0);
  const completedRef = useRef<boolean>(false);
  // Keep the latest callback without restarting the animation when the parent re-renders
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!animate) {
      setDisplayText(targetText);
      setSettledCount(Array.from(targetText).length);
      return;
    }

    completedRef.current = false;
    lastSettledRef.current = 0;
    const wildDuration = 400; // Initial wild scramble before settling begins
    const startTime = performance.now();
    let animationFrameId: number;

    const updateFrame = (now: number) => {
      const elapsed = now - startTime;

      if (elapsed >= durationMs) {
        if (!completedRef.current) {
          completedRef.current = true;
          setDisplayText(targetText);
          setSettledCount(length);
          soundEngine.playRevealChime();
          onCompleteRef.current?.();
        }
        return;
      }

      let currentSettled = 0;
      if (elapsed > wildDuration) {
        const settleProgress = (elapsed - wildDuration) / (durationMs - wildDuration);
        currentSettled = Math.min(length, Math.floor(settleProgress * length));
      }

      if (currentSettled > lastSettledRef.current) {
        lastSettledRef.current = currentSettled;
        soundEngine.playSafeTick();
      }

      const nextChars = characters.map((targetChar, idx) => {
        if (targetChar === ' ') return ' ';
        if (idx < currentSettled) return targetChar;
        return getRandomGlyph();
      });

      setDisplayText(nextChars.join(''));
      setSettledCount(currentSettled);

      animationFrameId = requestAnimationFrame(updateFrame);
    };

    animationFrameId = requestAnimationFrame(updateFrame);
    return () => cancelAnimationFrame(animationFrameId);
  }, [targetText, durationMs, length, animate]);

  return (
    <div
      data-testid="matrix-scramble-text"
      className={`font-mono font-black text-3xl sm:text-4xl text-amber-300 tracking-wider py-2 select-none drop-shadow-[0_0_15px_rgba(249,170,46,0.6)] ${className}`}
    >
      {Array.from(displayText).map((char, idx) => (
        <span
          key={idx}
          className={
            idx < settledCount
              ? 'text-amber-300 font-extrabold transition-colors duration-150'
              : 'text-emerald-400/90 font-normal drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]'
          }
        >
          {char}
        </span>
      ))}
    </div>
  );
};
