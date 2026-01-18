<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { appState, appConfig } from '$lib/stores/app.svelte';
  import { applyTheme, subscribeToSystemTheme } from '$lib/services/theme';
  import Onboarding from '$lib/components/Onboarding.svelte';
  import Chat from '$lib/components/Chat.svelte';

  let ready = $state(false);

  // Apply theme reactively
  $effect(() => {
    if (!browser) return;
    applyTheme(appConfig.theme);
    if (appConfig.theme === 'system') {
      return subscribeToSystemTheme(() => applyTheme('system'));
    }
  });

  onMount(() => {
    // Ensure hydration happened (should be automatic but let's be safe)
    appConfig.hydrate();

    // Small delay to ensure state has propagated after hydration
    requestAnimationFrame(() => {
      // Validate stored config - must have both onboarding completed AND valid workspace
      const hasValidWorkspace = appConfig.workspace?.path && appConfig.workspace.path.length > 0;

      console.log('[mensa] Checking config after hydration:', {
        onboardingCompleted: appConfig.onboardingCompleted,
        workspace: appConfig.workspace,
        hasValidWorkspace
      });

      if (appConfig.onboardingCompleted && hasValidWorkspace) {
        appState.current = 'chat';
      } else {
        // Reset if state is inconsistent
        if (appConfig.onboardingCompleted && !hasValidWorkspace) {
          console.log('[mensa] Inconsistent state - resetting');
          appConfig.reset();
        }
        appState.current = 'onboarding';
      }

      ready = true;
    });
  });
</script>

<main class="app">
  {#if !ready}
    <!-- Loading state while hydrating -->
    <div class="loading">
      <span class="loading-icon">◈</span>
    </div>
  {:else if appState.current === 'onboarding'}
    <Onboarding />
  {:else}
    <Chat />
  {/if}
</main>

<style>
  .app {
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  .loading {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--white);
  }

  .loading-icon {
    font-size: 1.5rem;
    color: var(--gray-300);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
</style>
