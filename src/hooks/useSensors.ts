import React, { useState, useEffect, useCallback, useRef } from 'react';

export interface UseCardTiltOptions {
  maxTiltDeg?: number; // default: 20
  perspective?: number; // default: 1000
}

export interface CardTiltResult {
  rotateX: number;
  rotateY: number;
  shineX: number;
  shineY: number;
  gradientAngle: number;
  tiltStyle: React.CSSProperties;
  shineStyle: React.CSSProperties;
  cardRef: React.RefObject<HTMLDivElement | null>;
  handleMouseMove: (e: React.MouseEvent<HTMLElement>) => void;
  handleMouseLeave: () => void;
  isGyroActive: boolean;
}

export interface UseSensorsReturn {
  tilt: { x: number; y: number };
  isGyro: boolean;
  permissionGranted: boolean;
  rotateX: number;
  rotateY: number;
  requestPermission: () => Promise<boolean>;
}

/**
 * Pure calculation for Gyroscope Tilt with clamping to [-maxDeg, +maxDeg]
 */
export function calculateGyroTilt(
  beta: number | null,
  gamma: number | null,
  maxDeg = 20
): { rotateX: number; rotateY: number } {
  if (beta === null || gamma === null) {
    return { rotateX: 0, rotateY: 0 };
  }
  const clampedBeta = Math.max(-45, Math.min(45, beta));
  const clampedGamma = Math.max(-45, Math.min(45, gamma));
  const rawX = Math.round(((-clampedBeta) / 45) * maxDeg * 100) / 100;
  const rawY = Math.round((clampedGamma / 45) * maxDeg * 100) / 100;
  return {
    rotateX: rawX === 0 ? 0 : rawX,
    rotateY: rawY === 0 ? 0 : rawY,
  };
}

/**
 * Pure calculation for Desktop Mouse Tilt relative to element bounding box
 */
export function calculateMouseTilt(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  maxDeg = 20
): { rotateX: number; rotateY: number } {
  if (rect.width <= 0 || rect.height <= 0) return { rotateX: 0, rotateY: 0 };
  const nX = Math.max(-1, Math.min(1, (clientX - (rect.left + rect.width / 2)) / (rect.width / 2)));
  const nY = Math.max(-1, Math.min(1, (clientY - (rect.top + rect.height / 2)) / (rect.height / 2)));
  const rawY = Math.round(nX * maxDeg * 100) / 100;
  const rawX = Math.round(-nY * maxDeg * 100) / 100;
  return {
    rotateX: rawX === 0 ? 0 : rawX,
    rotateY: rawY === 0 ? 0 : rawY,
  };
}

/**
 * Pure calculation for Parallax Shine Coordinates & Gradient Angle
 */
export function calculateParallaxShine(
  rotateX: number,
  rotateY: number,
  maxDeg = 20
): { shineX: number; shineY: number; gradientAngle: number } {
  const normY = maxDeg === 0 ? 0 : rotateY / maxDeg;
  const normX = maxDeg === 0 ? 0 : rotateX / maxDeg;
  const shineX = Math.max(0, Math.min(100, Math.round(50 + normY * 50)));
  const shineY = Math.max(0, Math.min(100, Math.round(50 - normX * 50)));
  const gradientAngle = Math.round(135 + normY * 45);
  return { shineX, shineY, gradientAngle };
}

export interface GyroBaseline {
  beta: number;
  gamma: number;
}

/** Degrees of device tilt (relative to the calibrated reading pose) that map to the full card tilt */
export const GYRO_RANGE_DEG = 30;
/** Tilt changes below this threshold are ignored (sensor noise) */
export const GYRO_DEADZONE_DEG = 1.2;

/**
 * Gyroscope tilt relative to a calibrated baseline (the pose in which the phone is held while
 * reading the card). Absolute beta/gamma values are useless for this: with the phone held
 * upright beta is already ~60-90deg, which used to pin the card at its maximum tilt on Android.
 */
export function calculateRelativeGyroTilt(
  beta: number | null,
  gamma: number | null,
  baseline: GyroBaseline | null,
  maxDeg = 20,
  rangeDeg = GYRO_RANGE_DEG,
  deadzoneDeg = GYRO_DEADZONE_DEG
): { rotateX: number; rotateY: number } {
  if (beta === null || gamma === null || baseline === null) {
    return { rotateX: 0, rotateY: 0 };
  }
  const applyDeadzone = (v: number) =>
    Math.abs(v) <= deadzoneDeg ? 0 : v - Math.sign(v) * deadzoneDeg;

  const dBeta = Math.max(-rangeDeg, Math.min(rangeDeg, applyDeadzone(beta - baseline.beta)));
  const dGamma = Math.max(-rangeDeg, Math.min(rangeDeg, applyDeadzone(gamma - baseline.gamma)));
  const rawX = Math.round(((-dBeta) / rangeDeg) * maxDeg * 100) / 100;
  const rawY = Math.round((dGamma / rangeDeg) * maxDeg * 100) / 100;
  return {
    rotateX: rawX === 0 ? 0 : rawX,
    rotateY: rawY === 0 ? 0 : rawY,
  };
}

/** Exponential smoothing (low-pass filter) to remove sensor jitter */
export function smoothValue(previous: number, next: number, alpha = 0.18): number {
  return previous + (next - previous) * alpha;
}

/**
 * Sensor hook returning gyroscope orientation with mouse fallback
 */
export function useSensors(options: UseCardTiltOptions = {}): UseSensorsReturn {
  const { maxTiltDeg = 20 } = options;
  const [angles, setAngles] = useState<{ rotateX: number; rotateY: number }>({ rotateX: 0, rotateY: 0 });
  const [isGyro, setIsGyro] = useState<boolean>(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return typeof (window as any).DeviceOrientationEvent !== 'undefined';
  });

  const lastGyroTimeRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setIsGyro(false);
      return;
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta !== null && e.gamma !== null) {
        lastGyroTimeRef.current = Date.now();
        setIsGyro(true);
        const { rotateX, rotateY } = calculateGyroTilt(e.beta, e.gamma, maxTiltDeg);
        setAngles({ rotateX, rotateY });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      // If gyro fired within 1000ms, prioritize real sensor
      if (Date.now() - lastGyroTimeRef.current < 1000) return;

      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const nX = (e.clientX / w) * 2 - 1; // -1 to 1
      const nY = (e.clientY / h) * 2 - 1; // -1 to 1

      const rotateY = Math.round(nX * maxTiltDeg * 100) / 100;
      const rotateX = Math.round(-nY * maxTiltDeg * 100) / 100;
      setAngles({ rotateX, rotateY });
    };

    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [maxTiltDeg]);

  const requestPermission = async (): Promise<boolean> => {
    if (
      typeof window !== 'undefined' &&
      typeof (window as any).DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        const granted = response === 'granted';
        setPermissionGranted(granted);
        return granted;
      } catch {
        setPermissionGranted(false);
        return false;
      }
    }
    setPermissionGranted(true);
    return true;
  };

  return {
    tilt: { x: angles.rotateY, y: angles.rotateX },
    isGyro,
    permissionGranted,
    rotateX: angles.rotateX,
    rotateY: angles.rotateY,
    requestPermission,
  };
}

/**
 * Unified Card Tilt Hook: Gyroscope with Smooth Desktop Mouse Fallback
 */
export function useCardTilt(options: UseCardTiltOptions = {}): CardTiltResult {
  const { maxTiltDeg = 20, perspective = 1000 } = options;

  const [angles, setAngles] = useState<{ rotateX: number; rotateY: number }>({ rotateX: 0, rotateY: 0 });
  const [isGyroActive, setIsGyroActive] = useState<boolean>(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const lastGyroTimeRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      return;
    }

    // Calibration / smoothing state (kept in refs: sensor events fire at 60Hz+)
    const baselineRef: { current: GyroBaseline | null } = { current: null };
    const eventCountRef = { current: 0 };
    const smoothRef = { x: 0, y: 0 };
    const pendingRef: { current: { rotateX: number; rotateY: number } | null } = { current: null };
    let rafId = 0;

    const flush = () => {
      rafId = 0;
      const next = pendingRef.current;
      if (!next) return;
      pendingRef.current = null;
      setAngles((prev) =>
        Math.abs(prev.rotateX - next.rotateX) < 0.05 && Math.abs(prev.rotateY - next.rotateY) < 0.05
          ? prev
          : next
      );
    };

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;

      lastGyroTimeRef.current = Date.now();
      setIsGyroActive(true);

      const count = ++eventCountRef.current;
      const baseline = baselineRef.current;
      if (!baseline) {
        // First reading = the pose the phone is held in while looking at the card
        baselineRef.current = { beta: e.beta, gamma: e.gamma };
        return;
      }

      // Fast re-centering during the first moments (phone is still being raised),
      // afterwards the baseline only follows very slowly so real tilting stays visible.
      const follow = count < 90 ? 0.06 : 0.008;
      baseline.beta += (e.beta - baseline.beta) * follow;
      baseline.gamma += (e.gamma - baseline.gamma) * follow;

      const target = calculateRelativeGyroTilt(e.beta, e.gamma, baseline, maxTiltDeg);
      smoothRef.x = smoothValue(smoothRef.x, target.rotateX);
      smoothRef.y = smoothValue(smoothRef.y, target.rotateY);

      pendingRef.current = {
        rotateX: Math.round(smoothRef.x * 100) / 100,
        rotateY: Math.round(smoothRef.y * 100) / 100,
      };
      if (!rafId) rafId = window.requestAnimationFrame(flush);
    };

    window.addEventListener('deviceorientation', handleOrientation);

    // iOS 13+ only delivers sensor data after an explicit permission request from a user gesture
    const orientationApi = (window as any).DeviceOrientationEvent;
    const needsPermission = typeof orientationApi?.requestPermission === 'function';
    const requestOnGesture = () => {
      window.removeEventListener('pointerdown', requestOnGesture);
      try {
        const result = orientationApi.requestPermission();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch {
        // permission request not possible - mouse/touch fallback stays active
      }
    };
    if (needsPermission) {
      window.addEventListener('pointerdown', requestOnGesture);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('pointerdown', requestOnGesture);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [maxTiltDeg]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (Date.now() - lastGyroTimeRef.current < 1000) return;

      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const { rotateX, rotateY } = calculateMouseTilt(e.clientX, e.clientY, rect, maxTiltDeg);
      setAngles({ rotateX, rotateY });
    },
    [maxTiltDeg]
  );

  const handleMouseLeave = useCallback(() => {
    if (Date.now() - lastGyroTimeRef.current < 1000) return;
    setAngles({ rotateX: 0, rotateY: 0 });
  }, []);

  const { shineX, shineY, gradientAngle } = calculateParallaxShine(angles.rotateX, angles.rotateY, maxTiltDeg);

  const tiltStyle: React.CSSProperties = {
    transform: `perspective(${perspective}px) rotateX(${angles.rotateX}deg) rotateY(${angles.rotateY}deg)`,
    transformStyle: 'preserve-3d',
    transition: isGyroActive ? 'none' : 'transform 0.15s ease-out',
  };

  const shineStyle: React.CSSProperties = {
    background: `radial-gradient(circle at ${shineX}% ${shineY}%, rgba(255,255,255,0.35) 0%, rgba(249,170,46,0.18) 35%, transparent 70%), linear-gradient(${gradientAngle}deg, rgba(255,0,128,0.08) 0%, rgba(249,170,46,0.2) 25%, rgba(0,255,255,0.15) 50%, rgba(255,215,0,0.2) 75%, rgba(255,0,128,0.08) 100%)`,
    opacity: angles.rotateX === 0 && angles.rotateY === 0 ? 0.35 : 0.85,
    mixBlendMode: 'overlay',
    transition: 'opacity 0.3s ease',
  };

  return {
    rotateX: angles.rotateX,
    rotateY: angles.rotateY,
    shineX,
    shineY,
    gradientAngle,
    tiltStyle,
    shineStyle,
    cardRef,
    handleMouseMove,
    handleMouseLeave,
    isGyroActive,
  };
}
