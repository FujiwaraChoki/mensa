<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { open } from '@tauri-apps/plugin-dialog';
  import { appConfig, appState } from '$lib/stores/app.svelte';
  import type { OnboardingStep } from '$lib/types';

  let step = $state<OnboardingStep>('welcome');
  let workspacePath = $state('');
  let workspaceName = $state('');

  const steps: OnboardingStep[] = ['welcome', 'workspace', 'ready'];

  async function selectDirectory() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select workspace folder'
      });

      if (selected && typeof selected === 'string') {
        workspacePath = selected;
        // Extract folder name from path
        workspaceName = selected.split('/').pop() || selected;
      }
    } catch (e) {
      console.error('Failed to select directory:', e);
    }
  }

  function goToStep(newStep: OnboardingStep) {
    step = newStep;
  }

  function completeOnboarding() {
    if (workspacePath) {
      appConfig.setWorkspace({
        path: workspacePath,
        name: workspaceName,
        lastOpened: new Date()
      });
    }
    appConfig.completeOnboarding();
    appState.current = 'chat';
  }
</script>

<div class="onboarding">
  {#if step === 'welcome'}
    <div class="step" in:fly={{ y: 20, duration: 400, easing: cubicOut }} out:fade={{ duration: 150 }}>
      <span class="step-label">01</span>
      <h1 class="title">mensa</h1>
      <p class="subtitle">Your minimal interface to Claude Code</p>
      <button class="btn-primary" onclick={() => goToStep('workspace')}>
        Begin
        <span class="arrow">→</span>
      </button>
    </div>
  {:else if step === 'workspace'}
    <div class="step" in:fly={{ y: 20, duration: 400, easing: cubicOut }} out:fade={{ duration: 150 }}>
      <span class="step-label">02</span>
      <h2 class="heading">Choose workspace</h2>
      <p class="description">Select a directory for Claude to work in</p>

      <button class="workspace-selector" onclick={selectDirectory}>
        {#if workspacePath}
          <span class="path">{workspacePath}</span>
        {:else}
          <span class="placeholder">Click to select folder</span>
        {/if}
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      <button class="btn-primary" disabled={!workspacePath} onclick={() => goToStep('ready')}>
        Continue
        <span class="arrow">→</span>
      </button>
    </div>
  {:else if step === 'ready'}
    <div class="step" in:fly={{ y: 20, duration: 400, easing: cubicOut }} out:fade={{ duration: 150 }}>
      <span class="step-label">03</span>
      <h2 class="heading">Ready</h2>
      <p class="description">
        Type a message to start. Claude can read files,
        run commands, and edit code in your workspace.
      </p>

      <div class="tips">
        <div class="tip">
          <kbd>⌘</kbd> + <kbd>K</kbd>
          <span>Quick actions</span>
        </div>
        <div class="tip">
          <kbd>⌘</kbd> + <kbd>.</kbd>
          <span>Toggle tools panel</span>
        </div>
      </div>

      <button class="btn-primary" onclick={completeOnboarding}>
        Start using mensa
        <span class="arrow">→</span>
      </button>
    </div>
  {/if}

  <!-- Progress dots -->
  <div class="progress">
    {#each steps as s, i}
      <button
        class="dot"
        class:active={s === step}
        class:completed={steps.indexOf(step) > i}
        onclick={() => goToStep(s)}
        disabled={s === 'ready' && !workspacePath}
        aria-label="Go to step {i + 1}"
      ></button>
    {/each}
  </div>
</div>

<style>
  .onboarding {
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--white);
    padding: 4rem;
    padding-top: 5rem; /* Account for macOS titlebar */
    position: relative;
    -webkit-app-region: drag;
  }

  .onboarding * {
    -webkit-app-region: no-drag;
  }

  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 400px;
  }

  .step-label {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--gray-400);
    letter-spacing: var(--tracking-wide);
    margin-bottom: 2rem;
  }

  .title {
    font-family: var(--font-sans);
    font-size: var(--text-3xl);
    font-weight: 500;
    color: var(--off-black);
    letter-spacing: var(--tracking-tight);
    margin: 0 0 0.75rem 0;
  }

  .heading {
    font-family: var(--font-sans);
    font-size: var(--text-xl);
    font-weight: 500;
    color: var(--off-black);
    letter-spacing: var(--tracking-tight);
    margin: 0 0 0.5rem 0;
  }

  .subtitle, .description {
    font-family: var(--font-sans);
    font-size: var(--text-base);
    color: var(--gray-500);
    line-height: 1.6;
    margin: 0 0 2.5rem 0;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--off-black);
    color: var(--white);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--off-black-soft);
    transform: translateY(-1px);
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-primary .arrow {
    transition: transform var(--transition-fast);
  }

  .btn-primary:hover:not(:disabled) .arrow {
    transform: translateX(2px);
  }

  .workspace-selector {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    background: var(--gray-100);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-md);
    cursor: pointer;
    margin-bottom: 1.5rem;
    transition: all var(--transition-fast);
  }

  .workspace-selector:hover {
    border-color: var(--gray-300);
    background: var(--white);
  }

  .workspace-selector .placeholder {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-400);
  }

  .workspace-selector .path {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--off-black);
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    max-width: 280px;
  }

  .workspace-selector .icon {
    width: 18px;
    height: 18px;
    color: var(--gray-400);
    flex-shrink: 0;
  }

  .tips {
    display: flex;
    gap: 2rem;
    margin-bottom: 2.5rem;
  }

  .tip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    color: var(--gray-500);
  }

  .tip kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    background: var(--gray-100);
    border: 1px solid var(--gray-200);
    border-radius: 4px;
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--gray-500);
  }

  .progress {
    position: absolute;
    bottom: 3rem;
    display: flex;
    gap: 8px;
  }

  .dot {
    width: 6px;
    height: 6px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--gray-300);
    cursor: pointer;
    transition: all var(--transition-normal);
  }

  .dot.active {
    background: var(--off-black);
    transform: scale(1.2);
  }

  .dot.completed {
    background: var(--gray-500);
  }

  .dot:hover:not(.active):not(:disabled) {
    background: var(--gray-400);
  }

  .dot:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
