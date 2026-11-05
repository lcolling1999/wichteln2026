import React, { useState, useRef, useCallback, useEffect } from 'react';
import { BoltIndicator } from './BoltIndicator';
import { SafeRotaryDial } from './SafeRotaryDial';
import { VaultDoor } from './VaultDoor';
import { useHaptics } from '../../hooks/useHaptics';
import { soundEngine } from '../../audio/soundEngine';
import {
  SAFE_COMBINATION,
  applyRotation,
  createInitialSafeState,
  directionLabel,
  getFeedbackLevel,
  getHeatLabel,
  getTickStepDegrees,
  type SafeState,
} from '../../utils/safeCombination';

export interface SafeVaultContainerProps {
  onUnlock?: () => void;
}

const TOTAL_BOLTS = SAFE_COMBINATION.length;
/** Minimum gap between two vibration pulses - a new vibrate() call cancels the running one */
const MIN_VIBRATE_GAP_MS = 38;
/** Time between the last bolt and the door starting to swing */
const DOOR_OPEN_DELAY_MS = 450;
/** Time the open door is shown before the reveal takes over */
const REVEAL_DELAY_MS = 1900;

export const SafeVaultContainer: React.FC<SafeVaultContainerProps> = ({ onUnlock }) => {
  const { proximityTick, boltLock } = useHaptics();
  const [lockedBolts, setLockedBolts] = useState<number>(0);
  const [visualAngle, setVisualAngle] = useState<number>(0);
  const [isVaultOpen, setIsVaultOpen] = useState<boolean>(false);
  const [proximity, setProximity] = useState<number>(0);
  const [wrongDirection, setWrongDirection] = useState<boolean>(false);

  const safeStateRef = useRef<SafeState>(createInitialSafeState());
  const tickAccumulatorRef = useRef<number>(0);
  const lastVibrateRef = useRef<number>(0);
  const isOpenRef = useRef<boolean>(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };
  }, []);

  const vibrateThrottled = useCallback(
    (fn: () => boolean, force = false) => {
      const now = Date.now();
      if (!force && now - lastVibrateRef.current < MIN_VIBRATE_GAP_MS) return;
      lastVibrateRef.current = now;
      fn();
    },
    []
  );

  const handleDeltaRotate = useCallback(
    (delta: number) => {
      if (isOpenRef.current || !Number.isFinite(delta) || delta === 0) return;

      // Visual dial follows the thumb 1:1
      setVisualAngle((prev) => (prev + delta) % 3600);

      const result = applyRotation(safeStateRef.current, delta);
      safeStateRef.current = result.state;

      setProximity(result.proximity);
      setWrongDirection(result.wrongDirection);

      if (result.lockedNow) {
        // Bolt snapped in: heavy double pulse + clunk (always wins over ticks)
        tickAccumulatorRef.current = 0;
        setLockedBolts(result.state.lockedBolts);
        vibrateThrottled(boltLock, true);
        soundEngine.playBoltLock();

        if (result.unlocked) {
          isOpenRef.current = true;
          setProximity(1);
          setWrongDirection(false);
          timersRef.current.push(
            setTimeout(() => {
              setIsVaultOpen(true);
              soundEngine.playVaultOpen();
            }, DOOR_OPEN_DELAY_MS),
            setTimeout(() => {
              onUnlockRef.current?.();
            }, DOOR_OPEN_DELAY_MS + REVEAL_DELAY_MS)
          );
        }
        return;
      }

      // Graduation ticks - finer grid and stronger feedback the closer the bolt is
      const step = getTickStepDegrees(result.distance);
      tickAccumulatorRef.current += Math.abs(delta);
      if (tickAccumulatorRef.current < step) return;
      tickAccumulatorRef.current %= step;

      if (result.wrongDirection) {
        // Against the required direction: dull sound, no vibration -> clearly "not this way"
        soundEngine.playSafeDull();
        return;
      }

      const level = getFeedbackLevel(result.distance);
      vibrateThrottled(() => proximityTick(level));
      soundEngine.playSafeProximityTick(level);
    },
    [boltLock, proximityTick, vibrateThrottled]
  );

  const handleTouchDial = () => {
    // Make sure audio is unlocked by the first touch; no feedback so the dial stays "silent" at rest
    soundEngine.ensureContext();
  };

  const activeTarget = SAFE_COMBINATION[Math.min(lockedBolts, TOTAL_BOLTS - 1)];
  const allLocked = lockedBolts >= TOTAL_BOLTS;

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
              Die Auslosung ist vollzogen! Knacke den Tresor wie ein Profi: Drehe den Knauf
              abwechselnd rechts, links, rechts – und taste dich an die Bolzen heran.
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
              onClickDial={handleTouchDial}
              disabled={isVaultOpen || allLocked}
              proximity={allLocked ? 1 : proximity}
              wrongDirection={wrongDirection}
            />
          </div>

          {/* Direction + heat guidance */}
          {!allLocked ? (
            <div className="space-y-2" data-testid="safe-guidance">
              <div
                data-testid="safe-direction-hint"
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                  wrongDirection
                    ? 'bg-red-500/20 border-red-400/60 text-red-200'
                    : 'bg-amber-400/15 border-amber-300/40 text-amber-200'
                }`}
              >
                <span>Bolzen {lockedBolts + 1}:</span>
                <span>Drehe {directionLabel(activeTarget.direction)}</span>
              </div>

              <div className="px-4">
                <div className="h-2 w-full rounded-full bg-slate-900/80 border border-white/10 overflow-hidden">
                  <div
                    data-testid="safe-heat-meter"
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((wrongDirection ? 0 : proximity) * 100)}%`,
                      background: 'linear-gradient(90deg, #38bdf8 0%, #facc15 60%, #F9AA2E 85%, #ef4444 100%)',
                      transition: 'width 0.12s ease-out',
                    }}
                  />
                </div>
                <div className="mt-1 text-[11px] font-medium text-amber-200/90" data-testid="safe-heat-label">
                  {wrongDirection
                    ? `Falsche Richtung – dreh ${directionLabel(activeTarget.direction)}`
                    : getHeatLabel(proximity)}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] font-medium text-amber-200/80">
              Alle 3 Bolzen entriegelt! Der Tresor springt auf...
            </div>
          )}
        </div>
      </VaultDoor>
    </div>
  );
};
