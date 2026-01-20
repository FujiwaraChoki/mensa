export const colors = {
  background: '#0a0a0a',
  backgroundGradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)',
  glass: 'rgba(255, 255, 255, 0.05)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  glassHighlight: 'rgba(255, 255, 255, 0.15)',
  accent: '#3b82f6',
  accentGlow: 'rgba(59, 130, 246, 0.5)',
  success: '#22c55e',
  successGlow: 'rgba(34, 197, 94, 0.5)',
  danger: '#ef4444',
  dangerGlow: 'rgba(239, 68, 68, 0.5)',
  text: '#ffffff',
  textMuted: '#a1a1aa',
  purple: '#8b5cf6',
  purpleGlow: 'rgba(139, 92, 246, 0.5)',
};

export const shadows = {
  glass: '0 8px 32px rgba(0, 0, 0, 0.3)',
  glow: (color: string) => `0 0 40px ${color}`,
  text: '0 2px 10px rgba(0, 0, 0, 0.5)',
};
