import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { colors, shadows } from '../styles/colors';

const codeLines = [
  { text: 'function greet(name: string) {', indent: 0 },
  { text: '  return `Hello, ${name}!`;', indent: 0 },
  { text: '}', indent: 0 },
];

const diffLines = [
  { type: 'context', text: 'function greet(name: string) {' },
  { type: 'deletion', text: '-  return "Hello, " + name;' },
  { type: 'addition', text: '+  return `Hello, ${name}!`;' },
  { type: 'context', text: '}' },
];

export const CodeFlow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1: Code typing (0-40 frames)
  // Phase 2: Diff view (40-80 frames)
  // Phase 3: Commit message (80-120 frames)

  const phase = frame < 40 ? 1 : frame < 80 ? 2 : 3;

  // Code typing progress
  const totalChars = codeLines.reduce((acc, line) => acc + line.text.length, 0);
  const typedChars = Math.floor(
    interpolate(frame, [0, 35], [0, totalChars], {
      extrapolateRight: 'clamp',
    })
  );

  // Calculate which characters to show
  let remainingChars = typedChars;
  const visibleCode = codeLines.map((line) => {
    if (remainingChars <= 0) return '';
    const visible = line.text.slice(0, remainingChars);
    remainingChars -= line.text.length;
    return visible;
  });

  // Diff panel animation
  const diffOpacity = interpolate(frame, [40, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const diffScale = spring({
    frame: frame - 40,
    fps,
    config: { damping: 15, stiffness: 100 },
  });

  // Commit message animation
  const commitOpacity = interpolate(frame, [80, 90], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const commitY = spring({
    frame: frame - 80,
    fps,
    config: { damping: 200, stiffness: 100 },
  });

  const commitMessage = 'Fix: Use template literals for string interpolation';
  const coAuthor = 'Co-Authored-By: Claude Opus 4 <noreply@anthropic.com>';

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
      {/* Code Editor Panel */}
      <div
        style={{
          width: 500,
          background: colors.glass,
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          border: `1px solid ${colors.glassBorder}`,
          boxShadow: shadows.glass,
          overflow: 'hidden',
          opacity: phase >= 1 ? 1 : 0,
        }}
      >
        {/* Editor header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${colors.glassBorder}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#eab308' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e' }} />
          <span
            style={{
              marginLeft: 12,
              fontSize: 14,
              fontFamily: 'monospace',
              color: colors.textMuted,
            }}
          >
            greet.ts
          </span>
        </div>

        {/* Code content */}
        <div style={{ padding: 20 }}>
          <pre
            style={{
              margin: 0,
              fontFamily: 'monospace',
              fontSize: 16,
              lineHeight: 1.6,
              color: colors.text,
            }}
          >
            {visibleCode.map((line, i) => (
              <div key={i}>
                <span style={{ color: colors.textMuted, marginRight: 16 }}>
                  {i + 1}
                </span>
                {line}
                {i === visibleCode.findIndex((l, idx) => idx === visibleCode.length - 1 || !visibleCode[idx + 1]) &&
                  line.length < codeLines[i].text.length && (
                    <span
                      style={{
                        opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0,
                        color: colors.accent,
                      }}
                    >
                      |
                    </span>
                  )}
              </div>
            ))}
          </pre>
        </div>
      </div>

      {/* Diff Panel */}
      {phase >= 2 && (
        <div
          style={{
            width: 450,
            background: colors.glass,
            backdropFilter: 'blur(20px)',
            borderRadius: 16,
            border: `1px solid ${colors.glassBorder}`,
            boxShadow: shadows.glass,
            overflow: 'hidden',
            opacity: diffOpacity,
            transform: `scale(${interpolate(diffScale, [0, 1], [0.9, 1])})`,
          }}
        >
          {/* Diff header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${colors.glassBorder}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 14, color: colors.accent }}>📊</span>
            <span
              style={{
                fontSize: 14,
                fontFamily: 'monospace',
                color: colors.textMuted,
              }}
            >
              Changes
            </span>
          </div>

          {/* Diff content */}
          <div style={{ padding: 16 }}>
            {diffLines.map((line, i) => {
              const lineDelay = 45 + i * 8;
              const lineOpacity = interpolate(frame, [lineDelay, lineDelay + 10], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });

              return (
                <div
                  key={i}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 14,
                    lineHeight: 1.8,
                    opacity: lineOpacity,
                    background:
                      line.type === 'addition'
                        ? 'rgba(34, 197, 94, 0.15)'
                        : line.type === 'deletion'
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'transparent',
                    color:
                      line.type === 'addition'
                        ? colors.success
                        : line.type === 'deletion'
                        ? colors.danger
                        : colors.textMuted,
                    padding: '2px 8px',
                    borderRadius: 4,
                    marginBottom: 4,
                  }}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Commit Message */}
      {phase >= 3 && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            width: 700,
            background: colors.glass,
            backdropFilter: 'blur(20px)',
            borderRadius: 16,
            border: `1px solid ${colors.success}`,
            boxShadow: `${shadows.glass}, ${shadows.glow(colors.successGlow)}`,
            padding: 20,
            opacity: commitOpacity,
            transform: `translateY(${interpolate(commitY, [0, 1], [30, 0])}px)`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 20 }}>✓</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: colors.success,
                fontFamily: 'monospace',
              }}
            >
              Committed
            </span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 16,
              color: colors.text,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            {commitMessage}
          </p>
          <p
            style={{
              margin: '8px 0 0 0',
              fontSize: 12,
              color: colors.textMuted,
              fontFamily: 'monospace',
            }}
          >
            {coAuthor}
          </p>
        </div>
      )}
    </div>
  );
};
