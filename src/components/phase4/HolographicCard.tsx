import React, { useState, useRef, useEffect } from 'react';
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
  const [isFlipping, setIsFlipping] = useState(false);
  const tapTimesRef = useRef<number[]>([]);
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    };
  }, []);

  /** Flip with its own smooth 0.6s animation - even while the gyroscope drives the tilt */
  const toggleFlip = () => {
    setIsFlipping(true);
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    flipTimerRef.current = setTimeout(() => setIsFlipping(false), 650);
    setIsFlipped((prev) => !prev);
  };

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
      toggleFlip();
      onTripleTap?.();
    }
  };

  const handleManualFlip = () => {
    toggleFlip();
  };

  const mergedStyle: React.CSSProperties = {
    ...tiltStyle,
    transform: isFlipped
      ? `${tiltStyle.transform} rotateY(180deg)`
      : tiltStyle.transform,
    transformStyle: 'preserve-3d',
    // During 3D flip animation, prioritize the flip transition so it runs butter-smooth at 60fps
    transition: isFlipping
      ? 'transform 0.65s cubic-bezier(0.25, 1, 0.5, 1)'
      : isGyroActive
      ? 'transform 0.1s linear'
      : 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
    willChange: 'transform',
    WebkitTransformStyle: 'preserve-3d',
  };

  return (
    <div
      data-testid="holographic-tilt-card"
      ref={cardRef}
      style={mergedStyle}
      onClick={handleCardClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative rounded-3xl glass-card-gold border border-amber-400/40 shadow-2xl p-6 sm:p-8 select-none cursor-pointer ${className}`}
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
          isFlipped ? 'opacity-0 pointer-events-none hidden' : 'opacity-100 pointer-events-auto block'
        }`}
      >
        {children}
      </div>

      {/* Back Face (Easter Egg 3 Secret Wishlist Notepad) */}
      {backContent && (
        <div
          className={`relative z-10 w-full transition-opacity duration-300 ${
            isFlipped ? 'opacity-100 pointer-events-auto block' : 'opacity-0 pointer-events-none hidden'
          }`}
          style={{
            transform: 'rotateY(180deg)',
            WebkitTransform: 'rotateY(180deg)',
          }}
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
