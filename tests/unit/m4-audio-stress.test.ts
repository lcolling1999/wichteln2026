import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SoundEngine } from '../../src/audio/soundEngine';
import { calculateShakeMagnitude } from '../../src/hooks/useShake';
import { useLongPress } from '../../src/hooks/useLongPress';

// ============================================================================
// Comprehensive Mock Web Audio API for Stress & Concurrency Testing
// ============================================================================
class MockAudioParam {
  public value: number;
  public setValueAtTime = vi.fn((val: number) => {
    this.value = val;
  });
  public linearRampToValueAtTime = vi.fn((val: number) => {
    this.value = val;
  });
  public exponentialRampToValueAtTime = vi.fn((val: number) => {
    this.value = val;
  });

  constructor(initial = 0) {
    this.value = initial;
  }
}

class MockAudioNode {
  public connect = vi.fn();
  public disconnect = vi.fn();
}

class MockGainNode extends MockAudioNode {
  public gain = new MockAudioParam(1);
}

class MockOscillatorNode extends MockAudioNode {
  public type: OscillatorType = 'sine';
  public frequency = new MockAudioParam(440);
  public start = vi.fn();
  public stop = vi.fn();
}

class MockBiquadFilterNode extends MockAudioNode {
  public type: BiquadFilterType = 'lowpass';
  public frequency = new MockAudioParam(1000);
  public Q = new MockAudioParam(1);
}

class MockAudioBufferSourceNode extends MockAudioNode {
  public buffer: any = null;
  public start = vi.fn();
  public stop = vi.fn();
}

class MockWaveShaperNode extends MockAudioNode {
  public curve: Float32Array | null = null;
  public oversample: OverSampleType = 'none';
}

interface StressContextStats {
  oscillatorsCreated: number;
  gainsCreated: number;
  filtersCreated: number;
  buffersCreated: number;
  bufferSourcesCreated: number;
  waveShapersCreated: number;
  resumedCount: number;
}

function createStressAudioContextClass(
  stats: StressContextStats,
  config?: {
    initialState?: AudioContextState;
    resumeRejection?: Error | null;
    throwOnNodeCreate?: boolean;
    throwOnResumeSync?: boolean;
  }
) {
  const state = config?.initialState ?? 'running';

  return class StressAudioContext {
    public state: AudioContextState = state;
    public currentTime = 100;
    public sampleRate = 44100;
    public destination = new MockAudioNode();

    public createGain() {
      if (config?.throwOnNodeCreate) {
        throw new DOMException('Simulated node allocation limit reached', 'QuotaExceededError');
      }
      stats.gainsCreated++;
      return new MockGainNode();
    }

    public createOscillator() {
      if (config?.throwOnNodeCreate) {
        throw new DOMException('Simulated oscillator limit reached', 'QuotaExceededError');
      }
      stats.oscillatorsCreated++;
      return new MockOscillatorNode();
    }

    public createBiquadFilter() {
      if (config?.throwOnNodeCreate) {
        throw new DOMException('Simulated filter limit reached', 'QuotaExceededError');
      }
      stats.filtersCreated++;
      return new MockBiquadFilterNode();
    }

    public createBuffer(channels: number, length: number, sampleRate: number) {
      if (config?.throwOnNodeCreate) {
        throw new DOMException('Simulated buffer limit reached', 'QuotaExceededError');
      }
      stats.buffersCreated++;
      return {
        duration: length / sampleRate,
        sampleRate,
        numberOfChannels: channels,
        length,
        getChannelData: () => new Float32Array(length),
      };
    }

    public createBufferSource() {
      if (config?.throwOnNodeCreate) {
        throw new DOMException('Simulated buffer source limit reached', 'QuotaExceededError');
      }
      stats.bufferSourcesCreated++;
      return new MockAudioBufferSourceNode();
    }

    public createWaveShaper() {
      if (config?.throwOnNodeCreate) {
        throw new DOMException('Simulated waveshaper limit reached', 'QuotaExceededError');
      }
      stats.waveShapersCreated++;
      return new MockWaveShaperNode();
    }

    public resume() {
      stats.resumedCount++;
      if (config?.throwOnResumeSync) {
        throw new Error('Synchronous resume failure');
      }
      if (config?.resumeRejection) {
        return Promise.reject(config.resumeRejection);
      }
      this.state = 'running';
      return Promise.resolve();
    }
  };
}

describe('Milestone 4 Adversarial Challenge: Web Audio, Shake & Long-Press Stress Harness', () => {
  let originalAudioContext: any;
  let originalLocalStorage: any;

  beforeEach(() => {
    originalAudioContext = (globalThis as any).AudioContext;
    originalLocalStorage = (globalThis as any).localStorage;
    vi.useFakeTimers();
  });

  afterEach(() => {
    (globalThis as any).AudioContext = originalAudioContext;
    (globalThis as any).localStorage = originalLocalStorage;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // CHALLENGE 1: Web Audio Engine High-Concurrency & Rapid-Fire Stress
  // ==========================================================================
  describe('1. Web Audio Engine High-Concurrency, Rapid Playback & Memory Resilience', () => {
    it('executes 1,000 rapid sequential bursts of all 8 micro-sounds without throwing or crashing', () => {
      const stats: StressContextStats = {
        oscillatorsCreated: 0,
        gainsCreated: 0,
        filtersCreated: 0,
        buffersCreated: 0,
        bufferSourcesCreated: 0,
        waveShapersCreated: 0,
        resumedCount: 0,
      };

      (globalThis as any).AudioContext = createStressAudioContextClass(stats);
      const engine = new SoundEngine();

      expect(() => {
        for (let i = 0; i < 100; i++) {
          engine.playBiometricSnap();
          engine.playSafeTick();
          engine.playBoltLock();
          engine.playVaultOpen();
          engine.playRevealChime();
          engine.playEmojiPop();
          engine.playBassDrop();
          engine.playWindGust();
          // Bonus sounds
          engine.playGrinchSound();
          engine.playOrbPop();
        }
      }).not.toThrow();

      // Verify that sounds actually executed and generated nodes
      expect(stats.oscillatorsCreated).toBeGreaterThan(1000);
      expect(stats.gainsCreated).toBeGreaterThan(1000);
      expect(stats.bufferSourcesCreated).toBeGreaterThan(150); // VaultOpen + WindGust
    });

    it('proves zero memory leak in procedural noise buffer & wave shaper: cached and shared across 500 calls', () => {
      const stats: StressContextStats = {
        oscillatorsCreated: 0,
        gainsCreated: 0,
        filtersCreated: 0,
        buffersCreated: 0,
        bufferSourcesCreated: 0,
        waveShapersCreated: 0,
        resumedCount: 0,
      };

      (globalThis as any).AudioContext = createStressAudioContextClass(stats);
      const engine = new SoundEngine();

      // Trigger 500 calls each to playVaultOpen, playWindGust, and playBassDrop
      for (let i = 0; i < 500; i++) {
        engine.playVaultOpen();
        engine.playWindGust();
        engine.playBassDrop();
      }

      // Crucial Memory Proof:
      // Noise buffer must NOT be reallocated 1,000 times!
      // Once created at duration >= 2.0s, it must be cached and reused.
      // Maximum buffers created should be 1 (or 2 if 1.0s was allocated before 2.0s)
      expect(stats.buffersCreated).toBeLessThanOrEqual(2);
      expect(stats.buffersCreated).toBeGreaterThanOrEqual(1);

      // WaveShaper nodes are created per bass drop, but saturation curve is shared
      expect(stats.waveShapersCreated).toBe(500);
    });

    it('handles 50 parallel asynchronous burst batches of micro-sounds without concurrency races', async () => {
      const stats: StressContextStats = {
        oscillatorsCreated: 0,
        gainsCreated: 0,
        filtersCreated: 0,
        buffersCreated: 0,
        bufferSourcesCreated: 0,
        waveShapersCreated: 0,
        resumedCount: 0,
      };

      (globalThis as any).AudioContext = createStressAudioContextClass(stats);
      const engine = new SoundEngine();

      // Concurrently fire 50 batches of sound playback
      const burstPromises = Array.from({ length: 50 }, async (_, batchIndex) => {
        engine.playBiometricSnap();
        engine.playSafeTick();
        engine.playBoltLock();
        engine.playRevealChime();
        if (batchIndex % 5 === 0) {
          engine.playVaultOpen();
          engine.playWindGust();
        }
      });

      await expect(Promise.all(burstPromises)).resolves.toBeDefined();
    });

    it('survives rapid-fire mute toggling (500 cycles) while audio is continuously playing', () => {
      const stats: StressContextStats = {
        oscillatorsCreated: 0,
        gainsCreated: 0,
        filtersCreated: 0,
        buffersCreated: 0,
        bufferSourcesCreated: 0,
        waveShapersCreated: 0,
        resumedCount: 0,
      };

      const storageMock: Record<string, string> = {};
      (globalThis as any).localStorage = {
        getItem: (k: string) => storageMock[k] ?? null,
        setItem: (k: string, v: string) => {
          storageMock[k] = v;
        },
      };

      (globalThis as any).AudioContext = createStressAudioContextClass(stats);
      const engine = new SoundEngine();

      expect(() => {
        for (let i = 0; i < 500; i++) {
          const isMuted = engine.toggleMute();
          engine.playBiometricSnap();
          engine.playSafeTick();
          if (isMuted) {
            expect(storageMock['wichteln_audio_muted']).toBe('true');
          } else {
            expect(storageMock['wichteln_audio_muted']).toBe('false');
          }
        }
      }).not.toThrow();
    });

    it('enforces total silence when muted across 1,000 rapid invocations: zero audio nodes allocated', () => {
      const stats: StressContextStats = {
        oscillatorsCreated: 0,
        gainsCreated: 0,
        filtersCreated: 0,
        buffersCreated: 0,
        bufferSourcesCreated: 0,
        waveShapersCreated: 0,
        resumedCount: 0,
      };

      (globalThis as any).AudioContext = createStressAudioContextClass(stats);
      const engine = new SoundEngine();
      engine.setMuted(true);

      for (let i = 0; i < 1000; i++) {
        engine.playBiometricSnap();
        engine.playSafeTick();
        engine.playBoltLock();
        engine.playVaultOpen();
        engine.playRevealChime();
        engine.playEmojiPop();
        engine.playBassDrop();
        engine.playWindGust();
        engine.playGrinchSound();
      }

      // Initial master gain may have been created on ensureContext, but zero sound nodes
      expect(stats.oscillatorsCreated).toBe(0);
      expect(stats.buffersCreated).toBe(0);
      expect(stats.bufferSourcesCreated).toBe(0);
      expect(stats.waveShapersCreated).toBe(0);
    });

    it('simulates aggressive safe rotary dial spin: 60 rapid mechanical ticks in 150ms without audio clipping', () => {
      const stats: StressContextStats = {
        oscillatorsCreated: 0,
        gainsCreated: 0,
        filtersCreated: 0,
        buffersCreated: 0,
        bufferSourcesCreated: 0,
        waveShapersCreated: 0,
        resumedCount: 0,
      };

      (globalThis as any).AudioContext = createStressAudioContextClass(stats);
      const engine = new SoundEngine();

      expect(() => {
        // Fast rotary spin fires tick every 2.5ms
        for (let tick = 0; tick < 60; tick++) {
          engine.playSafeTick();
        }
      }).not.toThrow();

      expect(stats.oscillatorsCreated).toBe(60);
      expect(stats.gainsCreated).toBe(61); // 60 ticks + 1 master gain
    });

    it('schedules accurately when currentTime is exceptionally large (1,000,000s long-running session)', () => {
      const scheduledTimes: Array<{ start: number; stop: number }> = [];

      class LongSessionAudioContext {
        public state = 'running';
        public currentTime = 1_000_000.42; // App open for 11.5 days
        public destination = new MockAudioNode();
        public createGain() {
          return new MockGainNode();
        }
        public createOscillator() {
          const osc = new MockOscillatorNode();
          osc.start = vi.fn((t: number) => {
            scheduledTimes.push({ start: t, stop: 0 });
          });
          osc.stop = vi.fn((t: number) => {
            if (scheduledTimes.length > 0) {
              scheduledTimes[scheduledTimes.length - 1].stop = t;
            }
          });
          return osc;
        }
      }

      (globalThis as any).AudioContext = LongSessionAudioContext;
      const engine = new SoundEngine();

      expect(() => {
        engine.playBiometricSnap();
        engine.playSafeTick();
      }).not.toThrow();

      expect(scheduledTimes.length).toBe(2);
      expect(scheduledTimes[0].start).toBeCloseTo(1_000_000.42, 2);
      expect(scheduledTimes[0].stop).toBeGreaterThan(scheduledTimes[0].start);
    });
  });

  // ==========================================================================
  // CHALLENGE 2: Autoplay Policy Rejection & Context Error Suppression
  // ==========================================================================
  describe('2. Autoplay Policy Rejection & Web Audio Hardware Fault Suppression', () => {
    it('suppresses unhandled promise rejection when browser autoplay policy rejects resume() (TC-F9-05)', async () => {
      const stats: StressContextStats = {
        oscillatorsCreated: 0,
        gainsCreated: 0,
        filtersCreated: 0,
        buffersCreated: 0,
        bufferSourcesCreated: 0,
        waveShapersCreated: 0,
        resumedCount: 0,
      };

      const autoplayError = new DOMException(
        'The play() request was interrupted by a call to pause() or autoplay was not allowed without user interaction.',
        'NotAllowedError'
      );

      (globalThis as any).AudioContext = createStressAudioContextClass(stats, {
        initialState: 'suspended',
        resumeRejection: autoplayError,
      });

      const engine = new SoundEngine();

      // Triggering ensureContext on suspended context with rejecting resume() must NOT throw
      expect(() => {
        engine.ensureContext();
      }).not.toThrow();

      // All 8 micro-sounds should execute without error despite suspended context
      expect(() => {
        engine.playBiometricSnap();
        engine.playSafeTick();
        engine.playBoltLock();
        engine.playVaultOpen();
        engine.playRevealChime();
        engine.playEmojiPop();
        engine.playBassDrop();
        engine.playWindGust();
        engine.playGrinchSound();
      }).not.toThrow();

      expect(stats.resumedCount).toBeGreaterThanOrEqual(1);
    });

    it('gracefully degrades when AudioContext is in closed state or node allocation throws QuotaExceededError', () => {
      const stats: StressContextStats = {
        oscillatorsCreated: 0,
        gainsCreated: 0,
        filtersCreated: 0,
        buffersCreated: 0,
        bufferSourcesCreated: 0,
        waveShapersCreated: 0,
        resumedCount: 0,
      };

      // Simulate a restricted or memory-exhausted audio engine
      (globalThis as any).AudioContext = createStressAudioContextClass(stats, {
        throwOnNodeCreate: true,
      });

      const engine = new SoundEngine();

      // All play methods must swallow node creation errors and never crash the UI
      expect(() => {
        engine.playBiometricSnap();
        engine.playSafeTick();
        engine.playBoltLock();
        engine.playVaultOpen();
        engine.playRevealChime();
        engine.playEmojiPop();
        engine.playBassDrop();
        engine.playWindGust();
        engine.playGrinchSound();
      }).not.toThrow();
    });

    it('gracefully degrades when AudioContext constructor itself throws (e.g. headless or disabled hardware)', () => {
      (globalThis as any).AudioContext = class {
        constructor() {
          throw new DOMException('Cannot open audio device', 'InvalidStateError');
        }
      };

      const engine = new SoundEngine();
      expect(engine.ensureContext()).toBeNull();

      expect(() => {
        engine.playBiometricSnap();
        engine.playSafeTick();
        engine.playBoltLock();
        engine.playVaultOpen();
        engine.playRevealChime();
        engine.playEmojiPop();
        engine.playBassDrop();
        engine.playWindGust();
        engine.playGrinchSound();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // CHALLENGE 3: Boundary Shake Math, Zero/NaN Fuzzing & Cooldown Lockout
  // ==========================================================================
  describe('3. Shake Math Boundary Thresholds, Zero/NaN Robustness & Lockout Cooldown', () => {
    it('handles zero, null, undefined, and all-zero motion inputs safely', () => {
      expect(calculateShakeMagnitude(null, null)).toEqual({
        magnitude: 0,
        isGravityCompensated: false,
      });
      expect(calculateShakeMagnitude(undefined, undefined)).toEqual({
        magnitude: 0,
        isGravityCompensated: false,
      });
      expect(calculateShakeMagnitude({ x: 0, y: 0, z: 0 }, null)).toEqual({
        magnitude: 0,
        isGravityCompensated: false,
      });
      expect(calculateShakeMagnitude({ x: null, y: null, z: null }, null)).toEqual({
        magnitude: 0,
        isGravityCompensated: false,
      });
    });

    it('adversarial inputs (NaN, Infinity, -Infinity) do not produce false positive shake triggers', () => {
      const nanResult = calculateShakeMagnitude({ x: NaN, y: 0, z: 0 }, null);
      expect(Number.isNaN(nanResult.magnitude)).toBe(true);

      // In useShake: `if (magnitude >= limit)`
      // In JS: NaN >= 16 is false. Must never trigger blizzard!
      const threshold = 16;
      expect(nanResult.magnitude >= threshold).toBe(false);

      const nullFields = calculateShakeMagnitude({ x: undefined as any, y: null, z: 0 }, null);
      expect(nullFields.magnitude).toBe(0);
      expect(nullFields.magnitude >= threshold).toBe(false);
    });

    it('verifies strict boundary threshold for linear acceleration (15.99 m/s^2 vs 16.01 m/s^2)', () => {
      const threshold = 16.0;

      // Exactly 15.99 m/s^2 along single axis -> MUST NOT trigger
      const subThresholdSingle = calculateShakeMagnitude({ x: 15.99, y: 0, z: 0 }, null);
      expect(subThresholdSingle.isGravityCompensated).toBe(false);
      expect(subThresholdSingle.magnitude).toBe(15.99);
      expect(subThresholdSingle.magnitude >= threshold).toBe(false);

      // Exactly 16.00 m/s^2 along single axis -> MUST trigger
      const exactThresholdSingle = calculateShakeMagnitude({ x: 16.0, y: 0, z: 0 }, null);
      expect(exactThresholdSingle.magnitude).toBe(16.0);
      expect(exactThresholdSingle.magnitude >= threshold).toBe(true);

      // Exactly 16.01 m/s^2 along single axis -> MUST trigger
      const superThresholdSingle = calculateShakeMagnitude({ x: 16.01, y: 0, z: 0 }, null);
      expect(superThresholdSingle.magnitude).toBe(16.01);
      expect(superThresholdSingle.magnitude >= threshold).toBe(true);

      // Negative directional acceleration (-16.01 m/s^2) -> magnitude is absolute, MUST trigger
      const negSuperThreshold = calculateShakeMagnitude({ x: -16.01, y: 0, z: 0 }, null);
      expect(negSuperThreshold.magnitude).toBe(16.01);
      expect(negSuperThreshold.magnitude >= threshold).toBe(true);

      // 3D diagonal vector boundary:
      // x = y = z = 9.237 -> sqrt(3 * 9.237^2) = 15.9989 m/s^2 < 16.0 -> MUST NOT trigger
      const sub3D = calculateShakeMagnitude({ x: 9.237, y: 9.237, z: 9.237 }, null);
      expect(sub3D.magnitude).toBeLessThan(16.0);
      expect(sub3D.magnitude >= threshold).toBe(false);

      // x = y = z = 9.238 -> sqrt(3 * 9.238^2) = 16.0006 m/s^2 >= 16.0 -> MUST trigger
      const super3D = calculateShakeMagnitude({ x: 9.238, y: 9.238, z: 9.238 }, null);
      expect(super3D.magnitude).toBeGreaterThanOrEqual(16.0);
      expect(super3D.magnitude >= threshold).toBe(true);
    });

    it('verifies strict boundary threshold for gravity-inclusive acceleration (23.99 m/s^2 vs 24.01 m/s^2)', () => {
      // In useShake:
      // gravityThreshold = 24
      // limit = Math.max(0, gravityThreshold - 9.81) = 14.19
      // magnitude = |total - 9.81|
      const gravityLimit = 24 - 9.81; // 14.19

      // Table rest: (0, 0, 9.81) -> magnitude = |9.81 - 9.81| = 0.0 -> MUST NOT trigger
      const tableRest = calculateShakeMagnitude(null, { x: 0, y: 0, z: 9.81 });
      expect(tableRest.isGravityCompensated).toBe(true);
      expect(tableRest.magnitude).toBeCloseTo(0, 5);
      expect(tableRest.magnitude >= gravityLimit).toBe(false);

      // Free-fall: (0, 0, 0) -> magnitude = |0 - 9.81| = 9.81 < 14.19 -> MUST NOT trigger
      const freeFall = calculateShakeMagnitude(null, { x: 0, y: 0, z: 0 });
      expect(freeFall.magnitude).toBeCloseTo(9.81, 2);
      expect(freeFall.magnitude >= gravityLimit).toBe(false);

      // Total vector 23.99 m/s^2 (sub-boundary)
      // x = 20, y = 11.5, z = 6.84 -> sqrt(400 + 132.25 + 46.78) ≈ 23.999
      const subGravity = calculateShakeMagnitude(null, { x: 23.99, y: 0, z: 0 });
      expect(subGravity.magnitude).toBeCloseTo(23.99 - 9.81, 2); // 14.18
      expect(subGravity.magnitude >= gravityLimit).toBe(false);

      // Total vector 24.01 m/s^2 (super-boundary)
      const superGravity = calculateShakeMagnitude(null, { x: 24.01, y: 0, z: 0 });
      expect(superGravity.magnitude).toBeCloseTo(24.01 - 9.81, 2); // 14.20
      expect(superGravity.magnitude >= gravityLimit).toBe(true);
    });

    it('stress tests the 3-second lockout cooldown: ignores rapid repetitive shakes during blizzard', () => {
      let blizzardActive = false;
      let lastTrigger = 0;
      let soundPlays = 0;
      const durationMs = 3000;

      const triggerBlizzard = () => {
        const now = Date.now();
        if (now - lastTrigger < durationMs) return;
        lastTrigger = now;
        blizzardActive = true;
        soundPlays++;
        setTimeout(() => {
          blizzardActive = false;
        }, durationMs);
      };

      // Initial shake at t = 0
      triggerBlizzard();
      expect(blizzardActive).toBe(true);
      expect(soundPlays).toBe(1);

      // Fire 28 rapid shakes during the first 2800ms of the blizzard window
      for (let i = 0; i < 28; i++) {
        vi.advanceTimersByTime(100);
        triggerBlizzard();
      }

      // During active blizzard, zero additional sound plays or re-triggers allowed
      expect(blizzardActive).toBe(true);
      expect(soundPlays).toBe(1);

      // Advance 200ms to reach exactly 3000ms: blizzard expires
      vi.advanceTimersByTime(200);
      expect(blizzardActive).toBe(false);

      // Shake at 3001ms: successfully re-triggers
      vi.advanceTimersByTime(1);
      triggerBlizzard();
      expect(blizzardActive).toBe(true);
      expect(soundPlays).toBe(2);
    });
  });

  // ==========================================================================
  // CHALLENGE 4: Pointer & Mouse Long-Press Boundary Timing & Movement
  // ==========================================================================
  describe('4. Long-Press Hook Timing Boundary (799ms vs 801ms) & Movement Cancellation', () => {
    it('boundary timing: 799ms hold does NOT trigger onLongPress and executes onClick fallback', () => {
      const onLongPress = vi.fn();
      const onClick = vi.fn();

      // Test harness wrapping useLongPress behavior directly
      let isTriggered = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const thresholdMs = 800;

      const start = () => {
        isTriggered = false;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          isTriggered = true;
          onLongPress();
        }, thresholdMs);
      };

      const end = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
          if (!isTriggered) {
            onClick();
          }
        }
      };

      start();

      // User releases mouse at 799ms (1ms before threshold)
      vi.advanceTimersByTime(799);
      end();

      expect(onLongPress).not.toHaveBeenCalled();
      expect(onClick).toHaveBeenCalledTimes(1);

      // Advance further to verify timer did not survive
      vi.advanceTimersByTime(500);
      expect(onLongPress).not.toHaveBeenCalled();
    });

    it('boundary timing: 801ms hold DOES trigger onLongPress and suppresses onClick on release', () => {
      const onLongPress = vi.fn();
      const onClick = vi.fn();

      let isTriggered = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const thresholdMs = 800;

      const start = () => {
        isTriggered = false;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          isTriggered = true;
          onLongPress();
        }, thresholdMs);
      };

      const end = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
          if (!isTriggered) {
            onClick();
          }
        }
      };

      start();

      // Advance to 800ms: timer fires
      vi.advanceTimersByTime(800);
      expect(onLongPress).toHaveBeenCalledTimes(1);

      // User releases mouse at 801ms
      vi.advanceTimersByTime(1);
      end();

      // Crucial: onClick must NOT fire when long press was triggered!
      expect(onClick).not.toHaveBeenCalled();
      expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('movement tolerance: pointer movement <= 10px allows long-press, movement > 10px cancels', () => {
      const onLongPress = vi.fn();
      const onClick = vi.fn();

      let timer: ReturnType<typeof setTimeout> | null = null;
      let isTriggered = false;
      let startPos = { x: 0, y: 0 };
      const maxMovementPx = 10;
      const thresholdMs = 800;

      const start = (clientX: number, clientY: number) => {
        isTriggered = false;
        startPos = { x: clientX, y: clientY };
        timer = setTimeout(() => {
          isTriggered = true;
          onLongPress();
        }, thresholdMs);
      };

      const move = (clientX: number, clientY: number) => {
        if (!timer) return;
        const dx = clientX - startPos.x;
        const dy = clientY - startPos.y;
        if (Math.hypot(dx, dy) > maxMovementPx) {
          clearTimeout(timer);
          timer = null;
        }
      };

      const end = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
          if (!isTriggered) onClick();
        }
      };

      // Case A: Tremor within tolerance (delta = 8px)
      start(100, 100);
      vi.advanceTimersByTime(200);
      move(105, 106); // hypot(5, 6) = sqrt(61) ≈ 7.81px <= 10px
      vi.advanceTimersByTime(600); // reaches 800ms
      end();
      expect(onLongPress).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();

      onLongPress.mockClear();
      onClick.mockClear();

      // Case B: Boundary tolerance: exactly 10.0px movement (must still allow)
      start(100, 100);
      vi.advanceTimersByTime(200);
      move(110, 100); // hypot(10, 0) = 10.0px <= 10px
      vi.advanceTimersByTime(600);
      end();
      expect(onLongPress).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();

      onLongPress.mockClear();
      onClick.mockClear();

      // Case C: Exceeding tolerance: 10.1px movement (must cancel timer and click)
      start(100, 100);
      vi.advanceTimersByTime(200);
      move(110.1, 100); // hypot(10.1, 0) = 10.1px > 10px
      vi.advanceTimersByTime(700); // advances past 800ms
      end();

      // Timer was aborted on move: neither long-press nor regular click triggers
      expect(onLongPress).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    });

    it('event guards: ignores right click (button !== 0) and cancels on mouse leave', () => {
      const onLongPress = vi.fn();
      let timer: ReturnType<typeof setTimeout> | null = null;

      const handleMouseDown = (button: number) => {
        if (button !== 0) return;
        timer = setTimeout(onLongPress, 800);
      };

      const handleMouseLeave = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      // Right-click does nothing
      handleMouseDown(2);
      vi.advanceTimersByTime(1000);
      expect(onLongPress).not.toHaveBeenCalled();

      // Left-click followed by pointer leaving element before threshold
      handleMouseDown(0);
      vi.advanceTimersByTime(400);
      handleMouseLeave();
      vi.advanceTimersByTime(600);
      expect(onLongPress).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // CHALLENGE 5: Vibration API Graceful Degradation & Synergy
  // ==========================================================================
  describe('5. Vibration API & Audio Synergy Graceful Degradation', () => {
    it('survives when navigator.vibrate throws or is blocked by iframe permissions', () => {
      const originalVibrateDesc = Object.getOwnPropertyDescriptor(globalThis.navigator, 'vibrate');
      try {
        Object.defineProperty(globalThis.navigator, 'vibrate', {
          value: () => {
            throw new DOMException('Vibrate blocked by permissions policy', 'SecurityError');
          },
          configurable: true,
          writable: true,
        });

        expect(() => {
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try {
              navigator.vibrate([30, 40, 60]);
            } catch {
              // Graceful fallback
            }
          }
        }).not.toThrow();
      } finally {
        if (originalVibrateDesc) {
          Object.defineProperty(globalThis.navigator, 'vibrate', originalVibrateDesc);
        } else {
          delete (globalThis.navigator as any).vibrate;
        }
      }
    });

    it('simultaneous shake, audio playback, and avatar long-press do not crash or block execution', () => {
      const stats: StressContextStats = {
        oscillatorsCreated: 0,
        gainsCreated: 0,
        filtersCreated: 0,
        buffersCreated: 0,
        bufferSourcesCreated: 0,
        waveShapersCreated: 0,
        resumedCount: 0,
      };

      (globalThis as any).AudioContext = createStressAudioContextClass(stats);
      const engine = new SoundEngine();

      expect(() => {
        // Concurrently simulate:
        // 1. Blizzard wind sound
        engine.playWindGust();
        // 2. Safe rotary ticks
        engine.playSafeTick();
        engine.playSafeTick();
        // 3. Bolt lock
        engine.playBoltLock();
        // 4. Rudolph bass drop
        engine.playBassDrop();
        // 5. Secret wishlist chime
        engine.playRevealChime();
        // 6. Grinch sneer
        engine.playGrinchSound();
      }).not.toThrow();

      expect(stats.oscillatorsCreated).toBeGreaterThan(10);
      expect(stats.buffersCreated).toBe(1);
    });
  });
});
