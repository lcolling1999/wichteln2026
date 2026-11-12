/**
 * Procedural Web Audio API Micro-Sounds Engine (Zero MP3/WAV/OGG downloads)
 * Complies with Feature 18, R4, and Playwright E2E TC-F9-01 through TC-F9-05.
 */

const STORAGE_MUTE_KEY = 'wichteln_audio_muted';

const getStorage = (): Storage | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage;
    }
  } catch {
    // Fallback
  }
  return null;
};

const getAudioContextClass = (): any => {
  try {
    if (typeof window !== 'undefined') {
      return window.AudioContext || (window as any).webkitAudioContext || null;
    }
    if (typeof globalThis !== 'undefined') {
      return (globalThis as any).AudioContext || null;
    }
  } catch {
    // Fallback
  }
  return null;
};

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;
  private cachedNoiseBuffer: AudioBuffer | null = null;
  private saturationCurve: Float32Array | null = null;
  private iosUnlocked: boolean = false;

  constructor() {
    this.isMuted = this.loadMuteState();
  }

  // -------------------------------------------------------------
  // Mute State & Persistence
  // -------------------------------------------------------------

  private loadMuteState(): boolean {
    try {
      const storage = getStorage();
      if (storage) {
        return storage.getItem(STORAGE_MUTE_KEY) === 'true';
      }
    } catch {
      // Graceful fallback for restricted contexts
    }
    return false;
  }

  private persistMuteState(muted: boolean): void {
    try {
      const storage = getStorage();
      if (storage) {
        storage.setItem(STORAGE_MUTE_KEY, String(muted));
      }
    } catch {
      // Graceful fallback
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.persistMuteState(muted);
    if (this.masterGain && this.ctx) {
      try {
        this.masterGain.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
      } catch {
        // Fallback
      }
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // -------------------------------------------------------------
  // AudioContext Lifecycle & Autoplay Policy Handling
  // -------------------------------------------------------------

  /**
   * Lazily initializes and resumes the AudioContext on user interaction.
   * Never throws and suppresses unhandled autoplay rejections.
   */
  public ensureContext(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx = getAudioContextClass();
      if (!AudioCtx) return null;
      try {
        const ctx: AudioContext = new AudioCtx();
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, ctx.currentTime);
        masterGain.connect(ctx.destination);
        this.ctx = ctx;
        this.masterGain = masterGain;
      } catch {
        return null;
      }
    }

    if (
      this.ctx &&
      (this.ctx.state === 'suspended' || (this.ctx.state as string) === 'interrupted')
    ) {
      this.ctx.resume().catch(() => {
        // Suppress unhandled rejection when resumed prior to user gesture
      });
    }

    // iOS Safari unlock: play a 1-sample silent buffer on first gesture & set audioSession to 'playback'
    if (this.ctx && !this.iosUnlocked) {
      this.iosUnlocked = true;
      try {
        if (typeof navigator !== 'undefined' && (navigator as any).audioSession) {
          (navigator as any).audioSession.type = 'playback';
        }
        const silent = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = silent;
        src.connect(this.ctx.destination);
        src.start(0);
      } catch {
        // Ignore in headless / mock environments
      }
    }

    return this.ctx;
  }

  /**
   * Alias for backward compatibility with existing components
   */
  public getContext(): AudioContext | null {
    return this.ensureContext();
  }

  // -------------------------------------------------------------
  // Procedural Noise & WaveShaper Helpers
  // -------------------------------------------------------------

  private getOrCreateNoiseBuffer(ctx: AudioContext, durationSeconds = 1.5): AudioBuffer | null {
    try {
      if (this.cachedNoiseBuffer && this.cachedNoiseBuffer.duration >= durationSeconds) {
        return this.cachedNoiseBuffer;
      }
      const sampleRate = ctx.sampleRate || 44100;
      const bufferSize = Math.ceil(sampleRate * durationSeconds);
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const output = buffer.getChannelData(0);

      // Pink noise approximation filter (Paul Kellet algorithm)
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        output[i] = (b0 + b1 + b2 + white * 0.5362) * 0.11;
      }

      this.cachedNoiseBuffer = buffer;
      return buffer;
    } catch {
      return null;
    }
  }

  private getOrCreateSaturationShaper(ctx: AudioContext): WaveShaperNode | null {
    try {
      const shaper = ctx.createWaveShaper();
      if (!this.saturationCurve) {
        const samples = 1024;
        const curve = new Float32Array(samples);
        const k = 2.0; // gentle saturation
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        this.saturationCurve = curve;
      }
      shaper.curve = this.saturationCurve as any;
      shaper.oversample = '2x';
      return shaper;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------
  // 8 Micro-Sound Synthesis Recipes + Bonus Grinch Sound
  // -------------------------------------------------------------

  /**
   * 1. playBiometricSnap():
   * Soft, high-tech biometric confirmation snap (short sine burst with exponential pitch drop and crisp attack).
   */
  public playBiometricSnap(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.04);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      osc.connect(gain);
      gain.connect(this.masterGain || ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch {}
  }

  /**
   * 2. playSafeTick():
   * High-frequency mechanical graduation tick (triangle wave 2200Hz -> 800Hz, 8ms decay).
   */
  public playSafeTick(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.008);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.008);

      osc.connect(gain);
      gain.connect(this.masterGain || ctx.destination);

      osc.start(now);
      osc.stop(now + 0.009);
    } catch {}
  }

  /**
   * 2b. playSafeProximityTick(level):
   * Graduated "warm/cold" tick for the combination lock. Higher level = closer to the bolt:
   * higher pitch, louder, slightly longer and (from level 2) with a soft warm ping on top.
   */
  public playSafeProximityTick(level: number): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const lvl = Math.max(0, Math.min(3, Math.round(level)));
      const startFreq = [1800, 2300, 2900, 3500][lvl];
      const gainPeak = [0.1, 0.16, 0.24, 0.32][lvl];
      const dur = [0.008, 0.012, 0.018, 0.026][lvl];
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(startFreq * 0.4, now + dur);
      gain.gain.setValueAtTime(gainPeak, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(this.masterGain || ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.002);

      if (lvl >= 2) {
        const ping = ctx.createOscillator();
        const pingGain = ctx.createGain();
        ping.type = 'sine';
        ping.frequency.setValueAtTime(lvl === 3 ? 1046 : 784, now);
        pingGain.gain.setValueAtTime(lvl === 3 ? 0.12 : 0.06, now);
        pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        ping.connect(pingGain);
        pingGain.connect(this.masterGain || ctx.destination);
        ping.start(now);
        ping.stop(now + 0.075);
      }
    } catch {}
  }

  /**
   * 2c. playSafeDull():
   * Soft, low and dull tick: the dial is turned in the wrong direction for the current bolt.
   */
  public playSafeDull(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(230, now);
      osc.frequency.exponentialRampToValueAtTime(130, now + 0.03);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      osc.connect(gain);
      gain.connect(this.masterGain || ctx.destination);
      osc.start(now);
      osc.stop(now + 0.032);
    } catch {}
  }

  /**
   * 3. playBoltLock():
   * Mechanical bolt lock clunk (dual oscillator: low punch 120Hz + metallic resonance 640Hz).
   */
  public playBoltLock(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      // Low punch oscillator (120Hz -> 35Hz)
      const oscPunch = ctx.createOscillator();
      const gainPunch = ctx.createGain();
      oscPunch.type = 'sine';
      oscPunch.frequency.setValueAtTime(120, now);
      oscPunch.frequency.exponentialRampToValueAtTime(35, now + 0.14);

      gainPunch.gain.setValueAtTime(0.35, now);
      gainPunch.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      oscPunch.connect(gainPunch);
      gainPunch.connect(this.masterGain || ctx.destination);

      oscPunch.start(now);
      oscPunch.stop(now + 0.16);

      // Metallic resonance oscillator (640Hz -> 240Hz)
      const oscRes = ctx.createOscillator();
      const gainRes = ctx.createGain();
      oscRes.type = 'triangle';
      oscRes.frequency.setValueAtTime(640, now);
      oscRes.frequency.exponentialRampToValueAtTime(240, now + 0.08);

      gainRes.gain.setValueAtTime(0.18, now);
      gainRes.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

      oscRes.connect(gainRes);
      gainRes.connect(this.masterGain || ctx.destination);

      oscRes.start(now);
      oscRes.stop(now + 0.09);
    } catch {}
  }

  /**
   * 4. playVaultOpen():
   * Deep reverberant vault door swing and pneumatic release (low drone with bandpass noise sweep).
   */
  public playVaultOpen(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      // Heavy resonant vault drone
      const oscDrone = ctx.createOscillator();
      const gainDrone = ctx.createGain();
      oscDrone.type = 'sine';
      oscDrone.frequency.setValueAtTime(80, now);
      oscDrone.frequency.exponentialRampToValueAtTime(38, now + 0.7);

      gainDrone.gain.setValueAtTime(0.001, now);
      gainDrone.gain.linearRampToValueAtTime(0.28, now + 0.12);
      gainDrone.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      oscDrone.connect(gainDrone);
      gainDrone.connect(this.masterGain || ctx.destination);

      oscDrone.start(now);
      oscDrone.stop(now + 0.9);

      // Pneumatic decompression release: bandpass noise sweep
      const noiseBuffer = this.getOrCreateNoiseBuffer(ctx, 1.0);
      if (noiseBuffer) {
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.setValueAtTime(2.5, now);
        filter.frequency.setValueAtTime(1600, now);
        filter.frequency.exponentialRampToValueAtTime(320, now + 0.65);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.01, now);
        noiseGain.gain.linearRampToValueAtTime(0.18, now + 0.08);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

        noiseSource.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain || ctx.destination);

        noiseSource.start(now);
        noiseSource.stop(now + 0.75);
      }
    } catch {}
  }

  /**
   * 5. playRevealChime():
   * Magical harmonic arpeggio (C5-E5-G5-C6 bell chime with harmonic overtone decay).
   */
  public playRevealChime(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const chords = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

      chords.forEach((freq, idx) => {
        const noteStart = now + idx * 0.075;

        // Fundamental tone
        const oscFund = ctx.createOscillator();
        const gainFund = ctx.createGain();
        oscFund.type = 'sine';
        oscFund.frequency.setValueAtTime(freq, noteStart);

        gainFund.gain.setValueAtTime(0.2, noteStart);
        gainFund.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.65);

        oscFund.connect(gainFund);
        gainFund.connect(this.masterGain || ctx.destination);

        oscFund.start(noteStart);
        oscFund.stop(noteStart + 0.7);

        // Harmonic overtone chime (2.0x fundamental)
        const oscHarm = ctx.createOscillator();
        const gainHarm = ctx.createGain();
        oscHarm.type = 'sine';
        oscHarm.frequency.setValueAtTime(freq * 2.0, noteStart);

        gainHarm.gain.setValueAtTime(0.07, noteStart);
        gainHarm.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.3);

        oscHarm.connect(gainHarm);
        gainHarm.connect(this.masterGain || ctx.destination);

        oscHarm.start(noteStart);
        oscHarm.stop(noteStart + 0.35);
      });
    } catch {}
  }

  /**
   * 6. playEmojiPop():
   * Cheerful pop on keyword chip tap (pitch-bent sine 400Hz -> 800Hz).
   */
  public playEmojiPop(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.055);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

      osc.connect(gain);
      gain.connect(this.masterGain || ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {}
  }

  /**
   * Alias / Companion for lobby orbs
   */
  public playOrbPop(): void {
    this.playEmojiPop();
  }

  /**
   * 7. playBassDrop():
   * 808 sub-bass boom for Rudolph Easter Egg (sine wave 65Hz sliding down to 35Hz with soft saturation).
   */
  public playBassDrop(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(65, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.45);

      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      const shaper = this.getOrCreateSaturationShaper(ctx);
      if (shaper) {
        osc.connect(shaper);
        shaper.connect(gain);
      } else {
        osc.connect(gain);
      }

      gain.connect(this.masterGain || ctx.destination);

      osc.start(now);
      osc.stop(now + 0.65);
    } catch {}
  }

  /**
   * 8. playWindGust():
   * Swirling winter blizzard wind gust for Shake Snowstorm (filtered pink/white noise buffer with LFO modulation).
   */
  public playWindGust(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const duration = 2.0;
      const noiseBuffer = this.getOrCreateNoiseBuffer(ctx, duration);
      if (!noiseBuffer) return;

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(3.0, now);

      // Swirling wind modulation
      filter.frequency.setValueAtTime(300, now);
      filter.frequency.exponentialRampToValueAtTime(850, now + 0.5);
      filter.frequency.exponentialRampToValueAtTime(450, now + 1.2);
      filter.frequency.exponentialRampToValueAtTime(250, now + 1.9);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.4);
      gain.gain.linearRampToValueAtTime(0.2, now + 1.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.95);

      noiseSource.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain || ctx.destination);

      noiseSource.start(now);
      noiseSource.stop(now + 2.0);
    } catch {}
  }

  /**
   * Bonus Sound: playGrinchSound() / playGrinchSneer()
   * Mischievous sneer / laugh for Easter Egg 4 Grinch pull-down synergy (CF-06).
   */
  public playGrinchSound(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Descending minor tritone arpeggio: Eb4, D4, C4, Gb3, F3
      const tones = [311.13, 293.66, 261.63, 185.0, 174.61];
      tones.forEach((freq, idx) => {
        const startTime = now + idx * 0.1;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.88, startTime + 0.08);

        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.09);

        osc.connect(gain);
        gain.connect(this.masterGain || ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.1);
      });
    } catch {}
  }

  public playGrinchSneer(): void {
    this.playGrinchSound();
  }
}

export const soundEngine = new SoundEngine();
