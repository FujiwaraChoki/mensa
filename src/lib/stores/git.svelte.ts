// mensa - Git State Management (Svelte 5 Runes)

import type { GitStatus, BranchInfo, GitCommit, DiffViewMode, GitFile } from '$lib/types/git';
import * as gitService from '$lib/services/git';

// ============================================================================
// Git Store
// ============================================================================

function createGitStore() {
  // State
  let status = $state<GitStatus | null>(null);
  let currentDiff = $state<string | null>(null);
  let selectedFile = $state<GitFile | null>(null);
  let selectedFileStaged = $state<boolean>(false);
  let claudeModifiedFiles = $state<Set<string>>(new Set());
  let showPanel = $state(false);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let branchInfo = $state<BranchInfo | null>(null);
  let commitLog = $state<GitCommit[]>([]);
  let diffViewMode = $state<DiffViewMode>('unified');

  // Commit dialog state
  let showCommitDialog = $state(false);
  let commitMessage = $state('');
  let isCommitting = $state(false);

  // PR dialog state
  let showPRDialog = $state(false);
  let prTitle = $state('');
  let prBody = $state('');
  let prBase = $state('main');
  let prHead = $state('');
  let isCreatingPR = $state(false);
  let ghCliAvailable = $state<boolean | null>(null);

  return {
    // Getters
    get status() { return status; },
    get currentDiff() { return currentDiff; },
    get selectedFile() { return selectedFile; },
    get selectedFileStaged() { return selectedFileStaged; },
    get claudeModifiedFiles() { return claudeModifiedFiles; },
    get showPanel() { return showPanel; },
    get isLoading() { return isLoading; },
    get error() { return error; },
    get branchInfo() { return branchInfo; },
    get commitLog() { return commitLog; },
    get diffViewMode() { return diffViewMode; },

    // Commit dialog getters
    get showCommitDialog() { return showCommitDialog; },
    get commitMessage() { return commitMessage; },
    get isCommitting() { return isCommitting; },

    // PR dialog getters
    get showPRDialog() { return showPRDialog; },
    get prTitle() { return prTitle; },
    get prBody() { return prBody; },
    get prBase() { return prBase; },
    get prHead() { return prHead; },
    get isCreatingPR() { return isCreatingPR; },
    get ghCliAvailable() { return ghCliAvailable; },

    // Derived getters
    get hasChanges() {
      return status ? gitService.hasChanges(status) : false;
    },
    get hasStagedChanges() {
      return status ? gitService.hasStagedChanges(status) : false;
    },
    get totalChangedFiles() {
      return status ? gitService.getTotalChangedFiles(status) : 0;
    },
    get allChangedFiles(): GitFile[] {
      if (!status) return [];
      return [
        ...status.staged,
        ...status.modified,
        ...status.untracked,
        ...status.deleted
      ];
    },

    // Setters
    set diffViewMode(mode: DiffViewMode) { diffViewMode = mode; },
    set commitMessage(msg: string) { commitMessage = msg; },
    set prTitle(title: string) { prTitle = title; },
    set prBody(body: string) { prBody = body; },
    set prBase(base: string) { prBase = base; },
    set prHead(head: string) { prHead = head; },

    // Actions
    togglePanel() {
      showPanel = !showPanel;
    },

    openPanel() {
      showPanel = true;
    },

    closePanel() {
      showPanel = false;
    },

    /**
     * Refresh git status from the repository
     */
    async refresh(workingDir: string) {
      if (!workingDir) return;

      isLoading = true;
      error = null;

      try {
        const [newStatus, newBranchInfo] = await Promise.all([
          gitService.getGitStatus(workingDir),
          gitService.getBranchInfo(workingDir)
        ]);

        status = newStatus;
        branchInfo = newBranchInfo;

        // Also set PR head branch to current branch
        if (newBranchInfo?.current && !prHead) {
          prHead = newBranchInfo.current;
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        console.error('[gitStore] Failed to refresh:', error);
      } finally {
        isLoading = false;
      }
    },

    /**
     * Select a file and load its diff
     */
    async selectFile(file: GitFile, workingDir: string, staged: boolean = false) {
      if (!workingDir) return;

      selectedFile = file;
      selectedFileStaged = staged;
      currentDiff = null;

      try {
        const diff = await gitService.getGitDiff(workingDir, file.path, staged);
        currentDiff = diff;
      } catch (e) {
        console.error('[gitStore] Failed to get diff:', e);
        currentDiff = null;
      }
    },

    /**
     * Clear the selected file
     */
    clearSelectedFile() {
      selectedFile = null;
      selectedFileStaged = false;
      currentDiff = null;
    },

    /**
     * Stage files
     */
    async stageFiles(workingDir: string, paths: string[]) {
      try {
        await gitService.stageFiles(workingDir, paths);
        await this.refresh(workingDir);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      }
    },

    /**
     * Stage all files
     */
    async stageAll(workingDir: string) {
      if (!status) return;

      const paths = [
        ...status.modified.map(f => f.path),
        ...status.untracked.map(f => f.path),
        ...status.deleted.map(f => f.path)
      ];

      if (paths.length > 0) {
        await this.stageFiles(workingDir, paths);
      }
    },

    /**
     * Unstage files
     */
    async unstageFiles(workingDir: string, paths: string[]) {
      try {
        await gitService.unstageFiles(workingDir, paths);
        await this.refresh(workingDir);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      }
    },

    /**
     * Unstage all files
     */
    async unstageAll(workingDir: string) {
      if (!status || status.staged.length === 0) return;

      const paths = status.staged.map(f => f.path);
      await this.unstageFiles(workingDir, paths);
    },

    /**
     * Discard changes in a file
     */
    async discardFile(workingDir: string, filePath: string) {
      try {
        await gitService.discardChanges(workingDir, filePath);
        await this.refresh(workingDir);

        // Clear selection if the discarded file was selected
        if (selectedFile?.path === filePath) {
          this.clearSelectedFile();
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      }
    },

    /**
     * Fetch from remote
     */
    async fetch(workingDir: string) {
      try {
        await gitService.fetchRemote(workingDir);
        await this.refresh(workingDir);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      }
    },

    /**
     * Pull from remote
     */
    async pull(workingDir: string) {
      try {
        await gitService.pullChanges(workingDir);
        await this.refresh(workingDir);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      }
    },

    /**
     * Track a file modified by Claude
     */
    trackClaudeModifiedFile(path: string) {
      claudeModifiedFiles = new Set([...claudeModifiedFiles, path]);
      console.log('[gitStore] Tracking Claude-modified file:', path);
    },

    /**
     * Check if a file was modified by Claude
     */
    isClaudeModifiedFile(path: string): boolean {
      return claudeModifiedFiles.has(path);
    },

    /**
     * Clear Claude modified files tracking
     */
    clearClaudeModifiedFiles() {
      claudeModifiedFiles = new Set();
    },

    /**
     * Load commit log
     */
    async loadCommitLog(workingDir: string, limit: number = 50, branch?: string) {
      try {
        commitLog = await gitService.getCommitLog(workingDir, limit, branch);
      } catch (e) {
        console.error('[gitStore] Failed to load commit log:', e);
        commitLog = [];
      }
    },

    // Commit dialog actions
    openCommitDialog() {
      showCommitDialog = true;
      commitMessage = '';
    },

    closeCommitDialog() {
      showCommitDialog = false;
      commitMessage = '';
    },

    setCommitMessage(msg: string) {
      commitMessage = msg;
    },

    /**
     * Create a commit
     */
    async commit(workingDir: string, message: string, push: boolean = false) {
      isCommitting = true;

      try {
        const hash = await gitService.createCommit(workingDir, message);
        console.log('[gitStore] Created commit:', hash);

        if (push) {
          // Check if we need to set upstream
          const needsUpstream = branchInfo?.upstream == null;
          await gitService.pushChanges(workingDir, needsUpstream);
          console.log('[gitStore] Pushed changes');
        }

        await this.refresh(workingDir);
        this.closeCommitDialog();
        this.clearClaudeModifiedFiles();

        return hash;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        isCommitting = false;
      }
    },

    // PR dialog actions
    async openPRDialog(workingDir: string) {
      // Check gh CLI availability
      if (ghCliAvailable === null) {
        ghCliAvailable = await gitService.checkGhCliAvailable();
      }

      if (!ghCliAvailable) {
        error = 'GitHub CLI (gh) is not installed or not authenticated. Please run "gh auth login" to authenticate.';
        return;
      }

      // Set defaults
      if (branchInfo) {
        prHead = branchInfo.current;
      }
      prBase = 'main';
      prTitle = '';
      prBody = '';

      showPRDialog = true;
    },

    closePRDialog() {
      showPRDialog = false;
      prTitle = '';
      prBody = '';
    },

    /**
     * Create a pull request
     */
    async createPR(workingDir: string) {
      if (!prTitle || !prBody) {
        error = 'Title and description are required';
        return null;
      }

      isCreatingPR = true;

      try {
        const url = await gitService.createPullRequest(workingDir, {
          base: prBase,
          head: prHead,
          title: prTitle,
          body: prBody
        });

        console.log('[gitStore] Created PR:', url);
        this.closePRDialog();

        return url;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        isCreatingPR = false;
      }
    },

    /**
     * Clear error
     */
    clearError() {
      error = null;
    },

    /**
     * Reset the store
     */
    reset() {
      status = null;
      currentDiff = null;
      selectedFile = null;
      selectedFileStaged = false;
      claudeModifiedFiles = new Set();
      showPanel = false;
      isLoading = false;
      error = null;
      branchInfo = null;
      commitLog = [];
      showCommitDialog = false;
      commitMessage = '';
      isCommitting = false;
      showPRDialog = false;
      prTitle = '';
      prBody = '';
      prBase = 'main';
      prHead = '';
      isCreatingPR = false;
    }
  };
}

// Export singleton instance
export const gitStore = createGitStore();
