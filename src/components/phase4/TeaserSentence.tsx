import React from 'react';
import { motion } from 'framer-motion';
import { Keyword } from '../../types';

export interface TeaserSentenceProps {
  sentence: string;
  keywords?: Keyword[];
  isVisible?: boolean;
  /** When false the sentence is shown right away without the word-by-word animation */
  animate?: boolean;
}

export const TeaserSentence: React.FC<TeaserSentenceProps> = ({
  sentence,
  keywords = [],
  isVisible = true,
  animate = true,
}) => {
  if (!isVisible || !sentence) return null;

  const rawWords = sentence.trim().split(/\s+/).filter(Boolean);

  const isReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const wordVariants = {
    hidden: {
      opacity: isReducedMotion ? 1 : 0,
      filter: isReducedMotion ? 'blur(0px)' : 'blur(12px)',
      rotateX: isReducedMotion ? 0 : 55,
      y: isReducedMotion ? 0 : 16,
    },
    visible: (index: number) => ({
      opacity: 1,
      filter: 'blur(0px)',
      rotateX: 0,
      y: 0,
      transition: {
        delay: isReducedMotion ? 0 : index * 0.08,
        duration: isReducedMotion ? 0 : 0.5,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    }),
  };

  return (
    <div
      data-testid="teaser-sentence-container"
      className="w-full my-4 px-3 py-2 text-center text-slate-100 text-base sm:text-lg font-medium leading-relaxed [perspective:1000px] [transform-style:preserve-3d]"
    >
      {rawWords.map((word, idx) => {
        const cleanWord = word.replace(/[.,!?;:()]/g, '').trim().toLowerCase();
        const isKeyword = keywords.some((k) => {
          const kw = k.word.trim().toLowerCase();
          return cleanWord === kw || cleanWord.includes(kw);
        });

        return (
          <motion.span
            key={idx}
            custom={idx}
            initial={animate ? 'hidden' : false}
            animate="visible"
            variants={wordVariants}
            data-word={cleanWord}
            className={`teaser-word inline-block mr-1.5 ${
              isKeyword
                ? 'text-amber-300 font-bold drop-shadow-[0_0_8px_rgba(249,170,46,0.5)]'
                : 'text-slate-100'
            }`}
          >
            {word}
          </motion.span>
        );
      })}
    </div>
  );
};
