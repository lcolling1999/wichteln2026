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

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta !== null && e.gamma !== null) {
        lastGyroTimeRef.current = Date.now();
        setIsGyroActive(true);
        const { rotateX, rotateY } = calculateGyroTilt(e.beta, e.gamma, maxTiltDeg);
        setAngles({ rotateX, rotateY });
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
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
