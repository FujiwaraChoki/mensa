import React from 'react';
import { interpolate, useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { colors, shadows } from '../styles/colors';

interface GlassCardProps {
  children: React.ReactNode;
  width?: number;
  height?: number;
  delay?: number;
  direction?: 'left' | 'right' | 'up' | 'down';
  glowColor?: string;
  style?: React.CSSProperties;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  width = 400,
  height = 200,
  delay = 0,
  direction = 'up',
  glowColor = colors.accent,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 200,
      stiffness: 100,
      mass: 0.5,
    },
  });

  const getInitialPosition = () => {
    switch (direction) {
      case 'left': return { x: -100, y: 0 };
      case 'right': return { x: 100, y: 0 };
      case 'up': return { x: 0, y: 100 };
      case 'down': return { x: 0, y: -100 };
    }
  };

  const initial = getInitialPosition();
  const translateX = interpolate(progress, [0, 1], [initial.x, 0]);
  const translateY = interpolate(progress, [0, 1], [initial.y, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const scale = interpolate(progress, [0, 1], [0.9, 1]);

  return (
    <div
      style={{
        width,
        height,
        background: colors.glass,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 20,
        border: `1px solid ${colors.glassBorder}`,
        boxShadow: `${shadows.glass}, ${shadows.glow(glowColor)}`,
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        opacity,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Glass highlight effect */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 100%)',
          borderRadius: '20px 20px 0 0',
          pointerEvents: 'none',
        }}
      />
      {children}
    </div>
  );
};
