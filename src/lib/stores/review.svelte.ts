// mensa - Review Mode Store (Svelte 5 Runes)

import { browser } from '$app/environment';
import type {
  ReviewPreset,
  ReviewSource,
  ReviewResult,
  ReviewFinding,
  FindingStatus,
  SeverityFilter,
} from '$lib/types/review';
import { BUILT_IN_PRESETS, DEFAULT_PRESET_ID } from '$lib/constants/reviewPresets';

const STORAGE_KEY_PRESETS = 'mensa-review-presets';
const STORAGE_KEY_HISTORY = 'mensa-review-history';
const MAX_HISTORY_ITEMS = 20;

// Progress state for ongoing reviews
interface ReviewProgress {
  current: number;
  total: number;
  currentFile: string;
  findingsCount: number;
}

function createReviewStore() {
  // Core state
  let isReviewing = $state(false);
  let currentReview = $state<ReviewResult | null>(null);
  let reviewHistory = $state<ReviewResult[]>([]);
  let customPresets = $state<ReviewPreset[]>([]);
  let selectedPresetId = $state<string>(DEFAULT_PRESET_ID);
  let source = $state<ReviewSource | null>(null);
  let error = $state<string | null>(null);
  let progress = $state<ReviewProgress | null>(null);

  // UI state
  let showReviewPanel = $state(false);
  let showPresetEditor = $state(false);
  let showReviewLauncher = $state(false);
  let findingFilter = $state<SeverityFilter>('all');
  let expandedFindingId = $state<string | null>(null);
  let initialized = $state(false);

  // Combine built-in and custom presets
  const allPresets = $derived([...BUILT_IN_PRESETS, ...customPresets]);

  // Get selected preset
  const selectedPreset = $derived(allPresets.find(p => p.id === selectedPresetId) ?? BUILT_IN_PRESETS[0]);

  // Filter findings based on severity filter
  const filteredFindings = $derived(() => {
    if (!currentReview) return [];
    const findings = currentReview.findings;

    switch (findingFilter) {
      case 'critical-only':
        return findings.filter(f => f.severity === 'critical');
      case 'no-nitpicks':
        return findings.filter(f => f.severity !== 'nitpick');
      default:
        return findings;
    }
  });

  // Hydrate from localStorage
  function hydrate() {
    if (!browser || initialized) return;

    // Load custom presets
    const storedPresets = localStorage.getItem(STORAGE_KEY_PRESETS);
    if (storedPresets) {
      try {
        customPresets = JSON.parse(storedPresets);
      } catch (e) {
        console.error('[review] Failed to parse stored presets:', e);
      }
    }

    // Load review history metadata
    const storedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (storedHistory) {
      try {
        const parsed = JSON.parse(storedHistory);
        // Convert date strings back to Date objects
        reviewHistory = parsed.map((r: ReviewResult) => ({
          ...r,
          createdAt: new Date(r.createdAt),
        }));
      } catch (e) {
        console.error('[review] Failed to parse stored history:', e);
      }
    }

    initialized = true;
  }

  // Save custom presets to localStorage
  function savePresets() {
    if (!browser) return;
    localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(customPresets));
  }

  // Save review history to localStorage
  function saveHistory() {
    if (!browser) return;
    // Only save metadata, not full diff content
    const historyMeta = reviewHistory.map(r => ({
      ...r,
      diffContent: undefined, // Don't persist full diffs
    }));
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(historyMeta));
  }

  // Auto-hydrate on client
  if (browser) {
    hydrate();
  }

  return {
    // State getters
    get isReviewing() { return isReviewing; },
    get currentReview() { return currentReview; },
    get reviewHistory() { return reviewHistory; },
    get allPresets() { return allPresets; },
    get customPresets() { return customPresets; },
    get selectedPresetId() { return selectedPresetId; },
    get selectedPreset() { return selectedPreset; },
    get source() { return source; },
    get error() { return error; },
    get progress() { return progress; },
    get showReviewPanel() { return showReviewPanel; },
    get showPresetEditor() { return showPresetEditor; },
    get showReviewLauncher() { return showReviewLauncher; },
    get findingFilter() { return findingFilter; },
    get expandedFindingId() { return expandedFindingId; },
    get filteredFindings() { return filteredFindings; },

    hydrate,

    // Preset management
    selectPreset(presetId: string) {
      if (allPresets.some(p => p.id === presetId)) {
        selectedPresetId = presetId;
      }
    },

    addCustomPreset(preset: Omit<ReviewPreset, 'id' | 'isBuiltIn'>) {
      const newPreset: ReviewPreset = {
        ...preset,
        id: crypto.randomUUID(),
        isBuiltIn: false,
      };
      customPresets = [...customPresets, newPreset];
      savePresets();
      return newPreset.id;
    },

    updateCustomPreset(presetId: string, updates: Partial<ReviewPreset>) {
      customPresets = customPresets.map(p =>
        p.id === presetId ? { ...p, ...updates } : p
      );
      savePresets();
    },

    deleteCustomPreset(presetId: string) {
      customPresets = customPresets.filter(p => p.id !== presetId);
      if (selectedPresetId === presetId) {
        selectedPresetId = DEFAULT_PRESET_ID;
      }
      savePresets();
    },

    // Source management
    setSource(newSource: ReviewSource) {
      source = newSource;
    },

    clearSource() {
      source = null;
    },

    // Review lifecycle
    startReview() {
      isReviewing = true;
      error = null;
      progress = { current: 0, total: 0, currentFile: '', findingsCount: 0 };
      currentReview = null;
    },

    updateProgress(updates: Partial<ReviewProgress>) {
      if (progress) {
        progress = { ...progress, ...updates };
      }
    },

    completeReview(result: ReviewResult) {
      currentReview = result;
      isReviewing = false;
      progress = null;

      // Add to history
      reviewHistory = [result, ...reviewHistory].slice(0, MAX_HISTORY_ITEMS);
      saveHistory();

      // Open the review panel
      showReviewPanel = true;
    },

    setError(errorMessage: string) {
      error = errorMessage;
      isReviewing = false;
      progress = null;
    },

    clearError() {
      error = null;
    },

    // Finding management
    updateFindingStatus(findingId: string, status: FindingStatus, dismissReason?: string) {
      if (!currentReview) return;

      currentReview = {
        ...currentReview,
        findings: currentReview.findings.map(f =>
          f.id === findingId ? { ...f, status, dismissReason } : f
        ),
      };
    },

    expandFinding(findingId: string | null) {
      expandedFindingId = findingId;
    },

    setFindingFilter(filter: SeverityFilter) {
      findingFilter = filter;
    },

    // UI state management
    openReviewLauncher() {
      showReviewLauncher = true;
    },

    closeReviewLauncher() {
      showReviewLauncher = false;
    },

    openReviewPanel() {
      showReviewPanel = true;
    },

    closeReviewPanel() {
      showReviewPanel = false;
    },

    toggleReviewPanel() {
      showReviewPanel = !showReviewPanel;
    },

    openPresetEditor() {
      showPresetEditor = true;
    },

    closePresetEditor() {
      showPresetEditor = false;
    },

    // History management
    loadHistoricalReview(reviewId: string) {
      const review = reviewHistory.find(r => r.id === reviewId);
      if (review) {
        currentReview = review;
        showReviewPanel = true;
      }
    },

    clearCurrentReview() {
      currentReview = null;
      progress = null;
      error = null;
    },

    clearHistory() {
      reviewHistory = [];
      saveHistory();
    },

    // Full reset
    reset() {
      isReviewing = false;
      currentReview = null;
      source = null;
      error = null;
      progress = null;
      showReviewPanel = false;
      showPresetEditor = false;
      showReviewLauncher = false;
      findingFilter = 'all';
      expandedFindingId = null;
    },
  };
}

// Export singleton instance
export const reviewStore = createReviewStore();
