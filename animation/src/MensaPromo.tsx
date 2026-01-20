import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from 'remotion';
import { LogoReveal } from './components/LogoReveal';
import { FeatureCards } from './components/FeatureCards';
import { CodeFlow } from './components/CodeFlow';
import { Finale } from './components/Finale';
import { Particles } from './components/Particles';
import { colors } from './styles/colors';

export const MensaPromo: React.FC = () => {
  const frame = useCurrentFrame();

  // Scene timings (in frames at 30fps)
  const SCENE_1_START = 0;
  const SCENE_1_END = 90;
  const SCENE_2_START = 90;
  const SCENE_2_END = 240;
  const SCENE_3_START = 240;
  const SCENE_3_END = 360;
  const SCENE_4_START = 360;
  const SCENE_4_END = 450;

  // Scene transition helpers
  const getSceneOpacity = (start: number, end: number, fadeIn = 15, fadeOut = 15) => {
    // Handle edge cases where fadeIn or fadeOut is 0
    const enterOpacity = fadeIn > 0
      ? interpolate(frame, [start, start + fadeIn], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;
    const exitOpacity = fadeOut > 0
      ? interpolate(frame, [end - fadeOut, end], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;
    return Math.min(enterOpacity, exitOpacity);
  };

  return (
    <AbsoluteFill
      style={{
        background: colors.backgroundGradient,
        overflow: 'hidden',
      }}
    >
      {/* Background particles - always visible */}
      <Particles count={60} />

      {/* Scene 1: Logo Reveal (0-3s / 0-90 frames) */}
      <Sequence from={SCENE_1_START} durationInFrames={SCENE_1_END - SCENE_1_START}>
        <AbsoluteFill style={{ opacity: getSceneOpacity(SCENE_1_START, SCENE_1_END, 0, 20) }}>
          <LogoReveal />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 2: Feature Cards (3-8s / 90-240 frames) */}
      <Sequence from={SCENE_2_START} durationInFrames={SCENE_2_END - SCENE_2_START}>
        <AbsoluteFill style={{ opacity: getSceneOpacity(SCENE_2_START, SCENE_2_END) }}>
          <FeatureCards />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 3: Code Flow (8-12s / 240-360 frames) */}
      <Sequence from={SCENE_3_START} durationInFrames={SCENE_3_END - SCENE_3_START}>
        <AbsoluteFill style={{ opacity: getSceneOpacity(SCENE_3_START, SCENE_3_END) }}>
          <CodeFlow />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 4: Finale (12-15s / 360-450 frames) */}
      <Sequence from={SCENE_4_START} durationInFrames={SCENE_4_END - SCENE_4_START}>
        <AbsoluteFill style={{ opacity: getSceneOpacity(SCENE_4_START, SCENE_4_END, 15, 0) }}>
          <Finale />
        </AbsoluteFill>
      </Sequence>

      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
