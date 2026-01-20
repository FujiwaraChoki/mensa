import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { colors, shadows } from '../styles/colors';

export const Finale: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Logo scale with bouncy spring
  const logoScale = spring({
    frame,
    fps,
    config: {
      damping: 8,
      stiffness: 80,
      mass: 0.5,
    },
  });

  // Glow pulse
  const glowIntensity = interpolate(
    Math.sin(frame * 0.15),
    [-1, 1],
    [0.5, 1]
  );

  // "Available Now" text animation
  const availableOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const availableY = spring({
    frame: frame - 30,
    fps,
    config: { damping: 200, stiffness: 100 },
  });

  // GitHub link animation
  const githubOpacity = interpolate(frame, [50, 70], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Particle burst effect
  const burstParticles = Array.from({ length: 20 }, (_, i) => {
    const angle = (i / 20) * Math.PI * 2;
    const distance = spring({
      frame: frame - 10,
      fps,
      config: { damping: 20, stiffness: 50 },
    });

    const x = Math.cos(angle) * distance * 300;
    const y = Math.sin(angle) * distance * 300;
    const opacity = interpolate(frame, [10, 60], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

    return { x, y, opacity, angle, id: i };
  });

  // Converging lines from corners
  const lines = [
    { startX: 0, startY: 0 },
    { startX: width, startY: 0 },
    { startX: 0, startY: height },
    { startX: width, startY: height },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Converging lines */}
      <svg
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        {lines.map((line, i) => {
          const progress = interpolate(frame, [0, 30], [0, 1], {
            extrapolateRight: 'clamp',
          });

          const currentX = interpolate(progress, [0, 1], [line.startX, width / 2]);
          const currentY = interpolate(progress, [0, 1], [line.startY, height / 2]);

          return (
            <line
              key={i}
              x1={line.startX}
              y1={line.startY}
              x2={currentX}
              y2={currentY}
              stroke={colors.accent}
              strokeWidth={2}
              strokeOpacity={interpolate(frame, [0, 15, 30], [0, 0.5, 0])}
            />
          );
        })}
      </svg>

      {/* Burst particles */}
      {burstParticles.map((particle) => (
        <div
          key={particle.id}
          style={{
            position: 'absolute',
            left: width / 2 + particle.x,
            top: height / 2 + particle.y,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: particle.id % 2 === 0 ? colors.accent : colors.purple,
            opacity: particle.opacity,
            boxShadow: `0 0 20px ${particle.id % 2 === 0 ? colors.accent : colors.purple}`,
          }}
        />
      ))}

      {/* Main logo */}
      <div
        style={{
          transform: `scale(${logoScale})`,
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: 160,
            fontWeight: 800,
            fontFamily: 'Inter, system-ui, sans-serif',
            color: colors.text,
            margin: 0,
            textShadow: `${shadows.text}, 0 0 ${80 * glowIntensity}px ${colors.accentGlow}`,
            letterSpacing: -4,
          }}
        >
          Mensa
        </h1>
      </div>

      {/* Available Now */}
      <div
        style={{
          opacity: availableOpacity,
          transform: `translateY(${interpolate(availableY, [0, 1], [20, 0])}px)`,
          marginTop: 20,
        }}
      >
        <span
          style={{
            fontSize: 36,
            fontWeight: 600,
            fontFamily: 'Inter, system-ui, sans-serif',
            color: colors.success,
            textShadow: `0 0 20px ${colors.successGlow}`,
          }}
        >
          Available Now
        </span>
      </div>

      {/* GitHub link */}
      <div
        style={{
          opacity: githubOpacity,
          marginTop: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 24px',
          background: colors.glass,
          backdropFilter: 'blur(20px)',
          borderRadius: 12,
          border: `1px solid ${colors.glassBorder}`,
        }}
      >
        <svg
          width={24}
          height={24}
          viewBox="0 0 24 24"
          fill={colors.text}
        >
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
        <span
          style={{
            fontSize: 18,
            fontFamily: 'monospace',
            color: colors.text,
          }}
        >
          github.com/FujiwaraChoki/mensa
        </span>
      </div>
    </div>
  );
};
