import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { GlassCard } from './GlassCard';
import { colors } from '../styles/colors';

interface Feature {
  title: string;
  description: string;
  icon: string;
  color: string;
}

const features: Feature[] = [
  {
    title: 'Chat with Claude',
    description: 'AI-powered coding assistant',
    icon: '🧠',
    color: colors.accent,
  },
  {
    title: 'Visual Git',
    description: 'Intuitive version control',
    icon: '🔀',
    color: colors.purple,
  },
  {
    title: 'Code Review',
    description: 'Automated quality checks',
    icon: '✓',
    color: colors.success,
  },
];

export const FeatureCards: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  return (
    <div
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 40,
      }}
    >
      {features.map((feature, index) => {
        const delay = index * 15;
        const direction = index === 0 ? 'left' : index === 2 ? 'right' : 'up';

        // Streaming text effect for description
        const textProgress = spring({
          frame: frame - delay - 20,
          fps,
          config: {
            damping: 200,
            stiffness: 50,
          },
        });

        const visibleChars = Math.floor(
          interpolate(textProgress, [0, 1], [0, feature.description.length])
        );

        // Icon pulse animation
        const iconScale = interpolate(
          Math.sin((frame - delay) * 0.1),
          [-1, 1],
          [1, 1.1]
        );

        // Floating animation
        const floatY = interpolate(
          Math.sin((frame + index * 20) * 0.05),
          [-1, 1],
          [-5, 5]
        );

        return (
          <GlassCard
            key={index}
            width={320}
            height={220}
            delay={delay}
            direction={direction as 'left' | 'right' | 'up' | 'down'}
            glowColor={feature.color}
            style={{
              transform: `translateY(${floatY}px)`,
            }}
          >
            {/* Icon */}
            <div
              style={{
                fontSize: 48,
                marginBottom: 16,
                transform: `scale(${iconScale})`,
                filter: `drop-shadow(0 0 20px ${feature.color})`,
              }}
            >
              {feature.icon}
            </div>

            {/* Title */}
            <h3
              style={{
                fontSize: 24,
                fontWeight: 700,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: colors.text,
                margin: 0,
                marginBottom: 8,
              }}
            >
              {feature.title}
            </h3>

            {/* Description with streaming effect */}
            <p
              style={{
                fontSize: 16,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: colors.textMuted,
                margin: 0,
                height: 24,
              }}
            >
              {feature.description.slice(0, visibleChars)}
              {visibleChars < feature.description.length && (
                <span
                  style={{
                    opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0,
                    color: feature.color,
                  }}
                >
                  |
                </span>
              )}
            </p>

            {/* Accent bar */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 3,
                background: `linear-gradient(90deg, transparent, ${feature.color}, transparent)`,
                borderRadius: '0 0 20px 20px',
              }}
            />
          </GlassCard>
        );
      })}
    </div>
  );
};
