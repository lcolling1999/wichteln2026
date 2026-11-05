import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SoundEngine, soundEngine } from '../../src/audio/soundEngine';

describe('Web Audio Micro-Sounds Engine (Feature 18, TC-F9-01..05)', () => {
  let originalAudioContext: any;
  let originalLocalStorage: any;

  beforeEach(() => {
    originalAudioContext = (globalThis as any).AudioContext;
    originalLocalStorage = (globalThis as any).localStorage;
  });

  afterEach(() => {
    (globalThis as any).AudioContext = originalAudioContext;
    (globalThis as any).localStorage = originalLocalStorage;
    vi.restoreAllMocks();
  });

  describe('1. Mute State Management & LocalStorage Persistence (TC-F9-04)', () => {
    it('initializes unmuted by default when localStorage is empty', () => {
      const storageMock: Record<string, string> = {};
      (globalThis as any).localStorage = {
        getItem: (k: string) => storageMock[k] ?? null,
        setItem: (k: string, v: string) => {
          storageMock[k] = v;
        },
      };

      const engine = new SoundEngine();
      expect(engine.getMuted()).toBe(false);
    });

    it('loads persisted muted state from localStorage on initialization', () => {
      const storageMock: Record<string, string> = {
        wichteln_audio_muted: 'true',
      };
      (globalThis as any).localStorage = {
        getItem: (k: string) => storageMock[k] ?? null,
        setItem: (k: string, v: string) => {
          storageMock[k] = v;
        },
      };

      const engine = new SoundEngine();
      expect(engine.getMuted()).toBe(true);
    });

    it('persists mute state changes to localStorage and returns correct values', () => {
      const storageMock: Record<string, string> = {};
      (globalThis as any).localStorage = {
        getItem: (k: string) => storageMock[k] ?? null,
        setItem: (k: string, v: string) => {
          storageMock[k] = v;
        },
      };

      const engine = new SoundEngine();
      expect(engine.getMuted()).toBe(false);

      const toggled = engine.toggleMute();
      expect(toggled).toBe(true);
      expect(engine.getMuted()).toBe(true);
      expect(storageMock['wichteln_audio_muted']).toBe('true');

      engine.setMuted(false);
      expect(engine.getMuted()).toBe(false);
      expect(storageMock['wichteln_audio_muted']).toBe('false');
    });

    it('handles localStorage errors gracefully without throwing', () => {
      (globalThis as any).localStorage = {
        getItem: () => {
          throw new Error('Storage access denied');
        },
        setItem: () => {
          throw new Error('Storage access denied');
        },
      };

      expect(() => {
        const engine = new SoundEngine();
        engine.setMuted(true);
        engine.toggleMute();
      }).not.toThrow();
    });
  });

  describe('2. AudioContext Lifecycle & Autoplay Handling (TC-F9-01, TC-F9-05)', () => {
    it('returns null in non-window/headless environment without AudioContext', () => {
      (globalThis as any).AudioContext = undefined;
      (globalThis as any).webkitAudioContext = undefined;

      const engine = new SoundEngine();
      expect(engine.ensureContext()).toBeNull();
      expect(engine.getContext()).toBeNull();
    });

    it('lazily instantiates AudioContext and masterGain on ensureContext', () => {
      const mockDestination = {};
      const mockMasterGain = {
        gain: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
      };

      class MockAudioContext {
        public destination = mockDestination;
        public state = 'running';
        public currentTime = 0;
        public createGain() {
          return mockMasterGain;
        }
      }

      (globalThis as any).AudioContext = MockAudioContext;

      const engine = new SoundEngine();
      const ctx = engine.ensureContext();
      expect(ctx).toBeInstanceOf(MockAudioContext);
      expect(mockMasterGain.connect).toHaveBeenCalledWith(mockDestination);
    });

    it('handles suspended state and suppresses resume rejection (TC-F9-05)', async () => {
      let resumeCalled = false;

      class MockSuspendedContext {
        public destination = {};
        public state = 'suspended';
        public currentTime = 0;
        public createGain() {
          return { gain: { setValueAtTime: vi.fn() }, connect: vi.fn() };
        }
        public resume() {
          resumeCalled = true;
          return Promise.reject(new Error('AudioContext was not allowed to start'));
        }
      }

      (globalThis as any).AudioContext = MockSuspendedContext;

      const engine = new SoundEngine();
      // Calling ensureContext should not throw despite promise rejection
      expect(() => engine.ensureContext()).not.toThrow();
      expect(resumeCalled).toBe(true);
    });
  });

  describe('3. Procedural Synthesis of All 8 Micro-Sounds + Bonus Sounds (TC-F9-02, TC-F9-03)', () => {
    it('executes all 8 micro-sound recipes without throwing in headless environment', () => {
      expect(() => soundEngine.playBiometricSnap()).not.toThrow();
      expect(() => soundEngine.playSafeTick()).not.toThrow();
      expect(() => soundEngine.playBoltLock()).not.toThrow();
      expect(() => soundEngine.playVaultOpen()).not.toThrow();
      expect(() => soundEngine.playRevealChime()).not.toThrow();
      expect(() => soundEngine.playEmojiPop()).not.toThrow();
      expect(() => soundEngine.playOrbPop()).not.toThrow();
      expect(() => soundEngine.playBassDrop()).not.toThrow();
      expect(() => soundEngine.playWindGust()).not.toThrow();
      expect(() => soundEngine.playGrinchSound()).not.toThrow();
      expect(() => soundEngine.playGrinchSneer()).not.toThrow();
    });

    it('synthesizes micro-sounds using native Web Audio nodes and correct parameters', () => {
      const createdNodes: {
        oscillators: Array<{ type: string; frequency: number }>;
        gains: number;
        filters: Array<{ type: string; frequency: number }>;
        buffers: number;
        waveShapers: number;
      } = {
        oscillators: [],
        gains: 0,
        filters: [],
        buffers: 0,
        waveShapers: 0,
      };

      class MockFullAudioContext {
        public destination = {};
        public state = 'running';
        public currentTime = 10;
        public sampleRate = 44100;

        public createGain() {
          createdNodes.gains++;
          return {
            gain: {
              setValueAtTime: vi.fn(),
              linearRampToValueAtTime: vi.fn(),
              exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
          };
        }

        public createOscillator() {
          const osc = {
            type: 'sine',
            frequency: {
              value: 440,
              setValueAtTime: vi.fn((val: number) => {
                osc.frequency.value = val;
              }),
              exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          };
          createdNodes.oscillators.push(osc);
          return osc;
        }

        public createBiquadFilter() {
          const filter = {
            type: 'lowpass',
            Q: { setValueAtTime: vi.fn() },
            frequency: {
              value: 1000,
              setValueAtTime: vi.fn((val: number) => {
                filter.frequency.value = val;
              }),
              exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
          };
          createdNodes.filters.push(filter);
          return filter;
        }

        public createBuffer(channels: number, length: number, sampleRate: number) {
          createdNodes.buffers++;
          return {
            duration: length / sampleRate,
            getChannelData: () => new Float32Array(length),
          };
        }

        public createBufferSource() {
          return {
            buffer: null,
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          };
        }

        public createWaveShaper() {
          createdNodes.waveShapers++;
          return {
            curve: null,
            oversample: 'none',
            connect: vi.fn(),
          };
        }
      }

      (globalThis as any).AudioContext = MockFullAudioContext;
      const engine = new SoundEngine();

      // Test 1: playBiometricSnap (880 -> 110)
      createdNodes.oscillators = [];
      engine.playBiometricSnap();
      expect(createdNodes.oscillators.length).toBe(1);
      expect(createdNodes.oscillators[0].frequency.value).toBe(880);

      // Test 2: playSafeTick (triangle 2200 -> 800)
      createdNodes.oscillators = [];
      engine.playSafeTick();
      expect(createdNodes.oscillators.length).toBe(1);
      expect(createdNodes.oscillators[0].type).toBe('triangle');
      expect(createdNodes.oscillators[0].frequency.value).toBe(2200);

      // Test 3: playBoltLock (dual oscillator: 120Hz sine + 640Hz triangle)
      createdNodes.oscillators = [];
      engine.playBoltLock();
      expect(createdNodes.oscillators.length).toBe(2);
      expect(createdNodes.oscillators.some((o) => o.type === 'sine' && o.frequency.value === 120)).toBe(true);
      expect(createdNodes.oscillators.some((o) => o.type === 'triangle' && o.frequency.value === 640)).toBe(true);

      // Test 4: playRevealChime (chords arpeggio: 4 notes + 4 harmonics = 8 oscillators)
      createdNodes.oscillators = [];
      engine.playRevealChime();
      expect(createdNodes.oscillators.length).toBe(8);

      // Test 5: playEmojiPop (sine 400 -> 800)
      createdNodes.oscillators = [];
      engine.playEmojiPop();
      expect(createdNodes.oscillators.length).toBe(1);
      expect(createdNodes.oscillators[0].frequency.value).toBe(400);

      // Test 6: playBassDrop (808 sub bass 65 -> 35 + wave shaper)
      createdNodes.oscillators = [];
      createdNodes.waveShapers = 0;
      engine.playBassDrop();
      expect(createdNodes.oscillators.length).toBe(1);
      expect(createdNodes.oscillators[0].frequency.value).toBe(65);
      expect(createdNodes.waveShapers).toBe(1);

      // Test 7: playWindGust (noise buffer + bandpass filter)
      createdNodes.filters = [];
      createdNodes.buffers = 0;
      engine.playWindGust();
      expect(createdNodes.filters.length).toBe(1);
      expect(createdNodes.filters[0].type).toBe('bandpass');
      expect(createdNodes.buffers).toBe(1);

      // Test 8: playVaultOpen (low drone + bandpass noise)
      createdNodes.oscillators = [];
      createdNodes.filters = [];
      engine.playVaultOpen();
      expect(createdNodes.oscillators.length).toBe(1);
      expect(createdNodes.oscillators[0].frequency.value).toBe(80);
      expect(createdNodes.filters.some((f) => f.type === 'bandpass')).toBe(true);

      // Test 9: playGrinchSound (sawtooth arpeggio)
      createdNodes.oscillators = [];
      engine.playGrinchSound();
      expect(createdNodes.oscillators.length).toBe(5);
      expect(createdNodes.oscillators[0].type).toBe('sawtooth');
    });

    it('enforces total silence when muted: zero oscillators or audio nodes created', () => {
      let nodesCreatedCount = 0;

      class MockStrictAudioContext {
        public destination = {};
        public state = 'running';
        public currentTime = 0;
        public createGain() {
          return {
            gain: { setValueAtTime: vi.fn() },
            connect: vi.fn(),
          };
        }
        public createOscillator() {
          nodesCreatedCount++;
          return {
            type: 'sine',
            frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          };
        }
        public createBufferSource() {
          nodesCreatedCount++;
          return { connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
        }
      }

      (globalThis as any).AudioContext = MockStrictAudioContext;
      const engine = new SoundEngine();
      engine.setMuted(true);

      // Call every sound method while muted
      engine.playBiometricSnap();
      engine.playSafeTick();
      engine.playBoltLock();
      engine.playVaultOpen();
      engine.playRevealChime();
      engine.playEmojiPop();
      engine.playBassDrop();
      engine.playWindGust();
      engine.playGrinchSound();

      // Zero sound-generating nodes should be created while muted
      expect(nodesCreatedCount).toBe(0);
    });
  });
});
