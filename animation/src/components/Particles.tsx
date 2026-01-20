import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { colors } from '../styles/colors';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  color: string;
}

interface ParticlesProps {
  count?: number;
  colors?: string[];
}

export const Particles: React.FC<ParticlesProps> = ({
  count = 50,
  colors: particleColors = [colors.accent, colors.purple, colors.success],
}) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  const particles = useMemo<Particle[]>(() => {
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed * 9999) * 10000;
      return x - Math.floor(x);
    };

    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: seededRandom(i * 1) * width,
      y: seededRandom(i * 2) * height,
      size: seededRandom(i * 3) * 4 + 1,
      speed: seededRandom(i * 4) * 0.5 + 0.2,
      opacity: seededRandom(i * 5) * 0.5 + 0.1,
      color: particleColors[Math.floor(seededRandom(i * 6) * particleColors.length)],
    }));
  }, [count, width, height, particleColors]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {particles.map((particle) => {
        const yOffset = (frame * particle.speed) % height;
        const currentY = (particle.y - yOffset + height) % height;

        const pulseOpacity = interpolate(
          Math.sin(frame * 0.05 + particle.id),
          [-1, 1],
          [particle.opacity * 0.5, particle.opacity]
        );

        const fadeIn = interpolate(frame, [0, 30], [0, 1], {
          extrapolateRight: 'clamp',
        });

        const fadeOut = interpolate(
          frame,
          [durationInFrames - 30, durationInFrames],
          [1, 0],
          { extrapolateLeft: 'clamp' }
        );

        return (
          <div
            key={particle.id}
            style={{
              position: 'absolute',
              left: particle.x,
              top: currentY,
              width: particle.size,
              height: particle.size,
              borderRadius: '50%',
              backgroundColor: particle.color,
              opacity: pulseOpacity * fadeIn * fadeOut,
              boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`,
            }}
          />
        );
      })}
    </div>
  );
};
