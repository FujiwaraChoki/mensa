import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { colors, shadows } from '../styles/colors';

export const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo scale animation with spring
  const logoScale = spring({
    frame,
    fps,
    config: {
      damping: 8,
      stiffness: 100,
      mass: 0.5,
    },
  });

  // Logo glow pulse
  const glowIntensity = interpolate(
    Math.sin(frame * 0.1),
    [-1, 1],
    [0.3, 0.8]
  );

  // Tagline fade in
  const taglineOpacity = interpolate(frame, [30, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const taglineY = spring({
    frame: frame - 30,
    fps,
    config: {
      damping: 200,
      stiffness: 100,
    },
  });

  // Letter-by-letter animation for "MENSA"
  const letters = ['M', 'E', 'N', 'S', 'A'];

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
      {/* Main logo */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          transform: `scale(${logoScale})`,
        }}
      >
        {letters.map((letter, index) => {
          const letterProgress = spring({
            frame: frame - index * 5,
            fps,
            config: {
              damping: 12,
              stiffness: 200,
              mass: 0.3,
            },
          });

          const letterY = interpolate(letterProgress, [0, 1], [-50, 0]);
          const letterOpacity = interpolate(letterProgress, [0, 1], [0, 1]);
          const letterRotation = interpolate(letterProgress, [0, 1], [-20, 0]);

          return (
            <span
              key={index}
              style={{
                fontSize: 140,
                fontWeight: 800,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: colors.text,
                textShadow: `${shadows.text}, 0 0 ${60 * glowIntensity}px ${colors.accentGlow}`,
                transform: `translateY(${letterY}px) rotate(${letterRotation}deg)`,
                opacity: letterOpacity,
                display: 'inline-block',
              }}
            >
              {letter}
            </span>
          );
        })}
      </div>

      {/* Tagline */}
      <div
        style={{
          opacity: taglineOpacity,
          transform: `translateY(${interpolate(taglineY, [0, 1], [20, 0])}px)`,
          marginTop: 20,
        }}
      >
        <span
          style={{
            fontSize: 32,
            fontWeight: 400,
            fontFamily: 'Inter, system-ui, sans-serif',
            color: colors.textMuted,
            letterSpacing: 4,
          }}
        >
          Your Claude Code IDE
        </span>
      </div>

      {/* Decorative line under logo */}
      <div
        style={{
          marginTop: 40,
          width: interpolate(logoScale, [0, 1], [0, 200]),
          height: 2,
          background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)`,
          opacity: interpolate(frame, [20, 50], [0, 0.8], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      />
    </div>
  );
};
