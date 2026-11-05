import React, { useState, useRef, useCallback } from 'react';
import { BoltIndicator } from './BoltIndicator';
import { SafeRotaryDial } from './SafeRotaryDial';
import { VaultDoor } from './VaultDoor';
import { useHaptics } from '../../hooks/useHaptics';
import { soundEngine } from '../../audio/soundEngine';

export interface SafeVaultContainerProps {
  onUnlock?: () => void;
}

const DEGREES_PER_TICK = 15;
const DEGREES_PER_BOLT = 360;
const TOTAL_BOLTS = 3;

export const SafeVaultContainer: React.FC<SafeVaultContainerProps> = ({ onUnlock }) => {
  const { tick, boltLock } = useHaptics();
  const [lockedBolts, setLockedBolts] = useState<number>(0);
  const [visualAngle, setVisualAngle] = useState<number>(0);
  const [isVaultOpen, setIsVaultOpen] = useState<boolean>(false);

  const forwardProgressRef = useRef<number>(0);
  const tickAccumulatorRef = useRef<number>(0);
  const clickCountRef = useRef<number>(0);

  const handleDeltaRotate = useCallback(
    (delta: number) => {
      if (isVaultOpen) return;

      // Update visual dial angle smoothly
      setVisualAngle((prev) => (prev + delta) % 360);

      // Forward (Clockwise) rotation
      if (delta > 0) {
        forwardProgressRef.current += delta;
        tickAccumulatorRef.current += delta;

        // Graduation tick check (every 15 degrees)
        if (tickAccumulatorRef.current >= DEGREES_PER_TICK) {
          tickAccumulatorRef.current %= DEGREES_PER_TICK;
          tick();
          soundEngine.playSafeTick();
        }

        // Bolt Lock Threshold Check
        setLockedBolts((currentLocked) => {
          if (currentLocked >= TOTAL_BOLTS) return currentLocked;
          const nextTarget = (currentLocked + 1) * DEGREES_PER_BOLT;

          if (forwardProgressRef.current >= nextTarget) {
            const nextCount = currentLocked + 1;
            boltLock(); // navigator.vibrate([20, 50, 20])
            soundEngine.playBoltLock();

            if (nextCount >= TOTAL_BOLTS) {
              // Trigger vault door swing
              setTimeout(() => {
                setIsVaultOpen(true);
                soundEngine.playVaultOpen();
                setTimeout(() => {
                  onUnlock?.();
                }, 800);
              }, 250);
            }
            return nextCount;
          }
          return currentLocked;
        });
      } else if (delta < 0) {
        // Reverse (Counter-Clockwise) rotation (TC-B5-02)
        // Bounded above the last locked bolt threshold
        const minProgress = lockedBolts * DEGREES_PER_BOLT;
        forwardProgressRef.current = Math.max(minProgress, forwardProgressRef.current + delta);
        tickAccumulatorRef.current = Math.max(0, tickAccumulatorRef.current + delta);
      }
    },
    [isVaultOpen, lockedBolts, tick, boltLock, onUnlock]
  );

  const handleClickDial = () => {
    soundEngine.playSafeTick();
    tick();

    // Fallback: Click-based bolt advancement for touchless or click testing
    clickCountRef.current += 1;
    if (clickCountRef.current % 4 === 0 && lockedBolts < TOTAL_BOLTS) {
      setLockedBolts((prev) => {
        const next = Math.min(TOTAL_BOLTS, prev + 1);
        forwardProgressRef.current = next * DEGREES_PER_BOLT;
        boltLock();
        soundEngine.playBoltLock();
        if (next >= TOTAL_BOLTS) {
          setTimeout(() => {
            setIsVaultOpen(true);
            soundEngine.playVaultOpen();
            setTimeout(() => {
              onUnlock?.();
            }, 800);
          }, 250);
        }
        return next;
      });
    }
  };

  return (
    <div
      data-testid="safe-reveal-container"
      className="relative flex flex-col items-center justify-center w-full max-w-md mx-auto my-6 px-2"
    >
      <VaultDoor isOpen={isVaultOpen}>
        <div data-testid="safe-vault" className="text-center space-y-4">
          <div className="space-y-1">
            <span className="text-4xl">🔐</span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Wichtel-Tresor
            </h2>
            <p className="text-xs text-slate-300 max-w-xs mx-auto">
              Die Auslosung ist vollzogen! Drehe den Tresorknauf im Uhrzeigersinn, um die 3
              Sicherheitsbolzen zu lösen.
            </p>
          </div>

          {/* 3 Bolt Indicators */}
          <div className="flex items-center justify-center gap-2 pt-1 pb-2">
            {[0, 1, 2].map((idx) => (
              <BoltIndicator
                key={idx}
                index={idx}
                isLocked={lockedBolts > idx}
                isCurrentTarget={lockedBolts === idx}
              />
            ))}
          </div>

          {/* Rotary Dial */}
          <div className="flex justify-center py-2">
            <SafeRotaryDial
              visualAngle={visualAngle}
              onDeltaRotate={handleDeltaRotate}
              onClickDial={handleClickDial}
              disabled={isVaultOpen}
            />
          </div>

          {/* Helper Progression Note */}
          <div className="text-[11px] font-medium text-amber-200/80">
            {lockedBolts === 0 && 'Drehe im Uhrzeigersinn (1 volle Umdrehung für Bolzen 1)'}
            {lockedBolts === 1 && 'Bolzen 1 eingerastet! Weiterdrehen für Bolzen 2...'}
            {lockedBolts === 2 && 'Bolzen 2 eingerastet! Noch 1 Drehung für den Tresor...'}
            {lockedBolts >= 3 && 'Alle 3 Bolzen entriegelt! Der Tresor springt auf...'}
          </div>
        </div>
      </VaultDoor>
    </div>
  );
};
