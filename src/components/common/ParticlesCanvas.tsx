import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  r: number;            // radius
  vy: number;           // vertical velocity
  vx: number;           // horizontal velocity
  swaySpeed: number;    // oscillation speed
  swayDist: number;     // sway amplitude
  swayOffset: number;   // phase angle
  alpha: number;        // opacity
  isGold: boolean;      // warm gold shimmer
}

interface ParticlesCanvasProps {
  isBlizzard?: boolean;
}

export const ParticlesCanvas: React.FC<ParticlesCanvasProps> = ({ isBlizzard = false }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = motionQuery.matches;

    const handleMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
      if (prefersReducedMotion) {
        renderStatic();
      } else {
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(render);
      }
    };

    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', handleMotionChange);
    } else if ((motionQuery as any).addListener) {
      (motionQuery as any).addListener(handleMotionChange);
    }

    let width = window.innerWidth;
    let height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const updateCanvasSize = () => {
      if (!canvas) return;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    updateCanvasSize();

    // Particle Count: throttled to 60 on mobile <= 360px, 140 on desktop
    const baseCount = width <= 360 ? 60 : width <= 768 ? 90 : 140;
    const count = isBlizzard ? baseCount * 3 : baseCount;

    // Pre-allocated object pool: ZERO allocations during animation loop
    const particles: Particle[] = new Array(count);
    for (let i = 0; i < count; i++) {
      particles[i] = {
        x: Math.random() * width,
        y: Math.random() * height,
        r: (Math.random() * 2 + 1) * (isBlizzard ? 1.4 : 1),
        vy: (Math.random() * 35 + 25) * (isBlizzard ? 5 : 1),
        vx: (Math.random() * 20 - 10) * (isBlizzard ? 6 : 1),
        swaySpeed: Math.random() * 2 + 0.8,
        swayDist: Math.random() * 25 + 8,
        swayOffset: Math.random() * Math.PI * 2,
        alpha: Math.random() * 0.6 + 0.25,
        isGold: i % 10 === 0,
      };
    }

    let animationFrameId: number;
    let lastTime = performance.now();
    let isTabVisible = !document.hidden;

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) {
        lastTime = performance.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleResize = () => {
      updateCanvasSize();
      if (prefersReducedMotion) {
        renderStatic();
      }
    };
    window.addEventListener('resize', handleResize);

    const drawParticle = (p: Particle) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
      ctx.fill();

      if (p.isGold) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(249, 170, 46, ${p.alpha * 0.55})`;
        ctx.fill();
      }
    };

    const renderStatic = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);
      for (let i = 0; i < count; i++) {
        drawParticle(particles[i]);
      }
      ctx.restore();
    };

    const render = (currentTime: number) => {
      if (!isTabVisible) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Delta-time capped at 0.1s to prevent teleportation
      const rawDt = (currentTime - lastTime) / 1000;
      const dt = Math.min(rawDt, 0.1);
      lastTime = currentTime;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      for (let i = 0; i < count; i++) {
        const p = particles[i];

        // Physics update
        p.swayOffset += p.swaySpeed * dt;
        const currentVx = p.vx + Math.sin(p.swayOffset) * p.swayDist;
        p.x += currentVx * dt;
        p.y += p.vy * dt;

        // Wrap around boundaries
        if (p.y > height + 10) {
          p.y = -10;
          p.x = Math.random() * width;
        }
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;

        drawParticle(p);
      }

      ctx.restore();

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    if (prefersReducedMotion) {
      renderStatic();
    } else {
      animationFrameId = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (motionQuery.removeEventListener) {
        motionQuery.removeEventListener('change', handleMotionChange);
      } else if ((motionQuery as any).removeListener) {
        (motionQuery as any).removeListener(handleMotionChange);
      }
    };
  }, [isBlizzard]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={isBlizzard ? 'snowstorm-overlay' : 'snow-canvas'}
      className={`snow-canvas particles-canvas fixed inset-0 pointer-events-none z-0 ${
        isBlizzard ? 'blizzard-active' : ''
      }`}
      style={{ width: '100vw', height: '100vh' }}
    />
  );
};
