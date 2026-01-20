// mensa - Built-in Review Presets

import type { ReviewPreset } from '$lib/types/review';

export const BUILT_IN_PRESETS: ReviewPreset[] = [
  {
    id: 'comprehensive',
    name: 'Comprehensive',
    icon: 'magnifying-glass',
    description: 'Full review covering all aspects: logic, security, performance, style, and more',
    isBuiltIn: true,
    focus: ['logic', 'security', 'performance', 'style', 'architecture', 'error-handling', 'types'],
    severity: 'all',
  },
  {
    id: 'security',
    name: 'Security',
    icon: 'shield',
    description: 'Focus on security vulnerabilities, injection risks, and sensitive data handling',
    isBuiltIn: true,
    focus: ['security', 'error-handling'],
    severity: 'no-nitpicks',
  },
  {
    id: 'performance',
    name: 'Performance',
    icon: 'bolt',
    description: 'Identify performance bottlenecks, inefficient algorithms, and resource leaks',
    isBuiltIn: true,
    focus: ['performance', 'architecture'],
    severity: 'no-nitpicks',
  },
  {
    id: 'architecture',
    name: 'Architecture',
    icon: 'building',
    description: 'Review code structure, design patterns, and maintainability',
    isBuiltIn: true,
    focus: ['architecture', 'types', 'documentation'],
    severity: 'all',
  },
  {
    id: 'style',
    name: 'Style & Consistency',
    icon: 'paintbrush',
    description: 'Check code style, naming conventions, and consistency',
    isBuiltIn: true,
    focus: ['style', 'documentation'],
    severity: 'all',
  },
  {
    id: 'testing',
    name: 'Testing',
    icon: 'beaker',
    description: 'Review test coverage, test quality, and edge cases',
    isBuiltIn: true,
    focus: ['testing', 'logic'],
    severity: 'no-nitpicks',
  },
  {
    id: 'accessibility',
    name: 'Accessibility',
    icon: 'eye',
    description: 'Check for accessibility issues in UI code',
    isBuiltIn: true,
    focus: ['accessibility', 'documentation'],
    severity: 'all',
  },
];

export const DEFAULT_PRESET_ID = 'comprehensive';
