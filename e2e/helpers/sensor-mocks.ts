import { Page } from '@playwright/test';

/**
 * Options for device shake simulation
 */
export interface ShakeSimulationOptions {
  maxAcceleration?: number; // Acceleration in m/s^2 (default 25)
  cycleCount?: number;      // Number of back-and-forth oscillations (default 6)
  intervalMs?: number;      // Time between events in ms (default 40)
}

/**
 * Options for device orientation (gyroscope tilt) simulation
 */
export interface OrientationSimulationOptions {
  beta: number;   // Front-to-back tilt in degrees (-180 to 180)
  gamma: number;  // Left-to-right tilt in degrees (-90 to 90)
  alpha?: number; // Compass heading in degrees (0 to 360, default 0)
}

/**
 * Recorded audio event from synthetic Web Audio API mock
 */
export interface AudioPlayedEvent {
  type: 'oscillator' | 'gain' | 'buffer';
  frequency?: number;
  gain?: number;
  timestamp: number;
}

/**
 * Injects synthetic mocks for navigator.vibrate, DeviceMotionEvent,
 * DeviceOrientationEvent, and Web Audio API into the page context.
 * Must be called before navigating or during page init.
 * 
 * @param page Playwright Page instance
 */
export async function injectSensorMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // ==========================================
    // 1. Synthetic navigator.vibrate Spy & Mock
    // ==========================================
    (window as any).__vibrations = [];
    (window as any).__vibrateSupported = true;

    const originalVibrate = navigator.vibrate?.bind(navigator);
    (navigator as any).vibrate = (pattern: any): boolean => {
      if (!(window as any).__vibrateSupported) {
        return false;
      }
      (window as any).__vibrations.push(pattern);
      if (originalVibrate) {
        try {
          return originalVibrate(pattern);
        } catch {
          return true;
        }
      }
      return true;
    };

    // ==========================================
    // 2. Synthetic DeviceMotionEvent (Shake)
    // ==========================================
    (window as any).__triggerShake = (maxAcc = 25, cycles = 6, interval = 40) => {
      let step = 0;
      const timer = setInterval(() => {
        const sign = step % 2 === 0 ? 1 : -1;
        const currentAcc = sign * maxAcc;
        const motionEvent = new DeviceMotionEvent('devicemotion', {
          acceleration: { x: currentAcc, y: currentAcc, z: 0 },
          accelerationIncludingGravity: { x: currentAcc, y: currentAcc, z: 9.81 },
          rotationRate: { alpha: 0, beta: 0, gamma: 0 },
          interval: 16,
        });
        window.dispatchEvent(motionEvent);
        step++;
        if (step >= cycles) {
          clearInterval(timer);
        }
      }, interval);
    };

    // ==========================================
    // 3. Synthetic DeviceOrientationEvent (Tilt)
    // ==========================================
    (window as any).__triggerOrientation = (beta: number, gamma: number, alpha = 0) => {
      const orientationEvent = new DeviceOrientationEvent('deviceorientation', {
        beta,
        gamma,
        alpha,
        absolute: false,
      });
      window.dispatchEvent(orientationEvent);
    };

    // ==========================================
    // 4. Synthetic Web Audio API Recorder & Spy
    // ==========================================
    (window as any).__audioLog = [];
    const OriginalAudioContext = window.AudioContext || (window as any).webkitAudioContext;

    if (OriginalAudioContext) {
      window.AudioContext = class extends OriginalAudioContext {
        constructor(options?: AudioContextOptions) {
          super(options);
        }

        createOscillator() {
          const osc = super.createOscillator();
          const origStart = osc.start.bind(osc);
          const origStop = osc.stop.bind(osc);

          osc.start = (when?: number) => {
            (window as any).__audioLog.push({
              type: 'oscillator',
              frequency: osc.frequency.value,
              timestamp: Date.now(),
            });
            return origStart(when);
          };

          return osc;
        }

        createGain() {
          const gain = super.createGain();
          const origSetValue = gain.gain.setValueAtTime.bind(gain.gain);

          gain.gain.setValueAtTime = (value: number, startTime: number) => {
            (window as any).__audioLog.push({
              type: 'gain',
              gain: value,
              timestamp: Date.now(),
            });
            return origSetValue(value, startTime);
          };

          return gain;
        }
      };
    }
  });
}

/**
 * Retrieves all recorded vibration invocations from the page.
 */
export async function getRecordedVibrations(page: Page): Promise<Array<number | number[]>> {
  return page.evaluate(() => (window as any).__vibrations || []);
}

/**
 * Checks whether a specific vibration pattern (e.g. 5 or [20, 50, 20]) was triggered.
 */
export async function hasVibratedPattern(
  page: Page,
  expectedPattern: number | number[]
): Promise<boolean> {
  const vibrations = await getRecordedVibrations(page);
  return vibrations.some((v) => {
    if (Array.isArray(expectedPattern) && Array.isArray(v)) {
      return (
        expectedPattern.length === v.length &&
        expectedPattern.every((val, idx) => val === v[idx])
      );
    }
    return v === expectedPattern;
  });
}

/**
 * Clears recorded vibrations in the page.
 */
export async function clearRecordedVibrations(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__vibrations = [];
  });
}

/**
 * Configures the page to simulate that navigator.vibrate is unsupported or returns false.
 */
export async function simulateVibrationUnsupported(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__vibrateSupported = false;
    delete (navigator as any).vibrate;
  });
}

/**
 * Triggers a synthetic device shake event sequence in the page.
 */
export async function triggerDeviceShake(
  page: Page,
  options?: ShakeSimulationOptions
): Promise<void> {
  const maxAcc = options?.maxAcceleration ?? 25;
  const cycles = options?.cycleCount ?? 6;
  const interval = options?.intervalMs ?? 40;

  await page.evaluate(
    ({ maxAcc, cycles, interval }) => {
      if (typeof (window as any).__triggerShake === 'function') {
        (window as any).__triggerShake(maxAcc, cycles, interval);
      }
    },
    { maxAcc, cycles, interval }
  );

  // Wait for the shake cycle to complete
  await page.waitForTimeout(cycles * interval + 50);
}

/**
 * Triggers a synthetic device orientation event (gyroscope tilt) in the page.
 */
export async function triggerDeviceTilt(
  page: Page,
  options: OrientationSimulationOptions
): Promise<void> {
  await page.evaluate(
    ({ beta, gamma, alpha }) => {
      if (typeof (window as any).__triggerOrientation === 'function') {
        (window as any).__triggerOrientation(beta, gamma, alpha ?? 0);
      }
    },
    { beta: options.beta, gamma: options.gamma, alpha: options.alpha }
  );
}

/**
 * Retrieves all audio events recorded by the synthetic AudioContext spy.
 */
export async function getRecordedAudioEvents(page: Page): Promise<AudioPlayedEvent[]> {
  return page.evaluate(() => (window as any).__audioLog || []);
}

/**
 * Simulates a circular drag gesture on the rotary safe dial.
 * Calculates rotational coordinates around dial center and executes
 * mouse/touch movement tracing one or multiple full 360° revolutions.
 * 
 * @param page Playwright Page
 * @param dialSelector CSS selector for rotary safe dial element
 * @param options Rotational parameters
 */
export async function simulateRotaryDialTurn(
  page: Page,
  dialSelector: string,
  options?: {
    turns?: number;
    stepsPerTurn?: number;
    clockwise?: boolean;
    radiusFraction?: number;
  }
): Promise<void> {
  const dial = page.locator(dialSelector);
  await dial.waitFor({ state: 'visible', timeout: 5000 });
  const box = await dial.boundingBox();
  if (!box) {
    throw new Error(`Rotary dial element '${dialSelector}' has no bounding box.`);
  }

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const radius = (box.width / 2) * (options?.radiusFraction ?? 0.75);

  const turns = options?.turns ?? 1;
  const stepsPerTurn = options?.stepsPerTurn ?? 24;
  const totalSteps = Math.round(turns * stepsPerTurn);
  const direction = options?.clockwise === false ? -1 : 1;

  // Start gesture at 0° (right edge of circular dial)
  const startX = centerX + radius;
  const startY = centerY;

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  for (let step = 1; step <= totalSteps; step++) {
    const angle = direction * (step / stepsPerTurn) * 2 * Math.PI;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    await page.mouse.move(x, y);
    await page.waitForTimeout(15);
  }

  await page.mouse.up();
  await page.waitForTimeout(100);
}

/**
 * Simulates a long-press gesture on a given element (useful for Rudolph-Mode Easter Egg).
 */
export async function simulateLongPress(
  page: Page,
  selector: string,
  durationMs = 900
): Promise<void> {
  const element = page.locator(selector);
  await element.waitFor({ state: 'visible' });
  const box = await element.boundingBox();
  if (!box) throw new Error(`Target '${selector}' not found for long press.`);

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
}

/**
 * Simulates a triple-tap gesture on a given element (useful for Secret Wish List Easter Egg).
 */
export async function simulateTripleTap(
  page: Page,
  selector: string,
  intervalMs = 100
): Promise<void> {
  const element = page.locator(selector);
  await element.waitFor({ state: 'visible' });

  for (let i = 0; i < 3; i++) {
    await element.click({ delay: 30 });
    if (i < 2) {
      await page.waitForTimeout(intervalMs);
    }
  }
  // Allow gesture and flip animation to settle
  await page.waitForTimeout(150);
}

/**
 * Simulates an overscroll pull-down gesture from the top edge of the viewport
 * (useful for Grinch-Mode Easter Egg).
 */
export async function simulateTopPullDown(
  page: Page,
  distancePx = 160
): Promise<void> {
  const viewport = page.viewportSize() || { width: 1280, height: 720 };
  const startX = viewport.width / 2;
  const startY = 10; // Top edge (y <= 20px)

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  const steps = 15;
  for (let i = 1; i <= steps; i++) {
    const currentY = startY + (distancePx / steps) * i;
    await page.mouse.move(startX, currentY);
    await page.waitForTimeout(20);
  }

  await page.waitForTimeout(200);
  await page.mouse.up();
}
