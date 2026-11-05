import React, { useState, useRef } from 'react';
import { useCardTilt } from '../../hooks/useSensors';

export interface HolographicCardProps {
  children: React.ReactNode;
  backContent?: React.ReactNode | ((props: { onFlipBack: () => void }) => React.ReactNode);
  className?: string;
  onTripleTap?: () => void;
}

export const HolographicCard: React.FC<HolographicCardProps> = ({
  children,
  backContent,
  className = '',
  onTripleTap,
}) => {
  const { tiltStyle, shineStyle, cardRef, handleMouseMove, handleMouseLeave, isGyroActive } = useCardTilt({
    maxTiltDeg: 20,
    perspective: 1000,
  });

  const [isFlipped, setIsFlipped] = useState(false);
  const tapTimesRef = useRef<number[]>([]);

  const handleCardClick = (e: React.MouseEvent) => {
    // Prevent accidental flip when user clicks or selects text inside inputs/textareas/buttons
    if ((e.target as HTMLElement).closest('textarea, input, button, a')) {
      return;
    }

    const now = Date.now();
    // 600ms sliding window per Easter Egg 3 specification
    tapTimesRef.current = [...tapTimesRef.current.filter((t) => now - t < 600), now];
    if (tapTimesRef.current.length >= 3) {
      tapTimesRef.current = [];
      setIsFlipped((prev) => !prev);
      onTripleTap?.();
    }
  };

  const handleManualFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  // 3D Rotation mechanics: rotates 180° around Y-axis while preserving perspective tilt
  const mergedStyle: React.CSSProperties = {
    ...tiltStyle,
    transform: isFlipped
      ? `${tiltStyle.transform} rotateY(180deg)`
      : tiltStyle.transform,
    transformStyle: 'preserve-3d',
    transition: isGyroActive ? 'none' : 'transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1)',
  };

  return (
    <div
      data-testid="holographic-tilt-card"
      ref={cardRef}
      style={mergedStyle}
      onClick={handleCardClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative rounded-3xl glass-card-gold border border-amber-400/40 shadow-2xl p-6 sm:p-8 select-none overflow-hidden cursor-pointer ${className}`}
    >
      {/* Parallax Holographic Shine Overlay */}
      <div
        data-testid="parallax-shine-overlay"
        className="absolute inset-0 pointer-events-none rounded-3xl z-20"
        style={shineStyle}
      />

      {/* Front Face with [data-testid="gift-card-front"] */}
      <div
        data-testid="gift-card-front"
        className={`relative z-10 w-full transition-opacity duration-300 ${
          isFlipped ? 'opacity-0 pointer-events-none invisible' : 'opacity-100 pointer-events-auto visible'
        }`}
        style={{ backfaceVisibility: 'hidden' }}
      >
        {children}
      </div>

      {/* Back Face (Easter Egg 3 Secret Wishlist Notepad) */}
      {backContent && (
        <div
          className={`absolute inset-0 z-10 p-5 sm:p-6 transition-opacity duration-300 [transform:rotateY(180deg)] ${
            isFlipped ? 'opacity-100 pointer-events-auto visible' : 'opacity-0 pointer-events-none invisible'
          }`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {typeof backContent === 'function'
            ? backContent({ onFlipBack: handleManualFlip })
            : React.isValidElement(backContent)
            ? React.cloneElement(backContent as React.ReactElement<any>, { onFlipBack: handleManualFlip })
            : backContent}
        </div>
      )}
    </div>
  );
};

export { HolographicCard as TiltCard };
