<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { WebLinksAddon } from '@xterm/addon-web-links';
  import { invoke } from '@tauri-apps/api/core';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { terminalStore } from '$lib/stores/terminal.svelte';
  import { appConfig } from '$lib/stores/app.svelte';
  import { getEffectiveTheme } from '$lib/services/theme';
  import '@xterm/xterm/css/xterm.css';

  let terminalEl: HTMLDivElement;
  let terminal: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  let ptyId: string | null = null;
  let unlistenOutput: UnlistenFn | null = null;
  let resizeObserver: ResizeObserver | null = null;

  // Theme colors for terminal
  const lightTheme = {
    background: '#ffffff',
    foreground: '#1a1a1a',
    cursor: '#1a1a1a',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(0, 0, 0, 0.15)',
    black: '#1a1a1a',
    red: '#dc322f',
    green: '#22863a',
    yellow: '#b08800',
    blue: '#0366d6',
    magenta: '#6f42c1',
    cyan: '#1b7c83',
    white: '#6a737d',
    brightBlack: '#586069',
    brightRed: '#cb2431',
    brightGreen: '#28a745',
    brightYellow: '#dbab09',
    brightBlue: '#2188ff',
    brightMagenta: '#8a63d2',
    brightCyan: '#3192aa',
    brightWhite: '#959da5'
  };

  const darkTheme = {
    background: '#1a1a1a',
    foreground: '#e6e6e6',
    cursor: '#e6e6e6',
    cursorAccent: '#1a1a1a',
    selectionBackground: 'rgba(255, 255, 255, 0.2)',
    black: '#1a1a1a',
    red: '#f97583',
    green: '#85e89d',
    yellow: '#ffea7f',
    blue: '#79b8ff',
    magenta: '#b392f0',
    cyan: '#73e3ff',
    white: '#e6e6e6',
    brightBlack: '#6a737d',
    brightRed: '#fdaeb7',
    brightGreen: '#bef5cb',
    brightYellow: '#fff5b1',
    brightBlue: '#c8e1ff',
    brightMagenta: '#d1bcf9',
    brightCyan: '#b3f0ff',
    brightWhite: '#fafbfc'
  };

  function getTerminalTheme() {
    const effectiveTheme = getEffectiveTheme(appConfig.theme);
    return effectiveTheme === 'dark' ? darkTheme : lightTheme;
  }

  // React to theme changes
  $effect(() => {
    const _ = appConfig.theme; // Subscribe to theme changes
    if (terminal) {
      terminal.options.theme = getTerminalTheme();
    }
  });

  onMount(async () => {
    // Initialize terminal
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
      lineHeight: 1.2,
      theme: getTerminalTheme(),
      allowProposedApi: true
    });

    fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(terminalEl);
    fitAddon.fit();

    // Get working directory from app config
    const workingDir = appConfig.workspace?.path ?? '/';

    // Spawn PTY - use zsh as default shell on macOS
    try {
      ptyId = await invoke<string>('plugin:pty|spawn', {
        shell: '/bin/zsh',
        args: [],
        cwd: workingDir,
        envs: {}
      });

      terminalStore.setActiveTerminalId(ptyId);

      // Listen for output from PTY
      unlistenOutput = await listen<{ id: string; data: number[] }>('plugin:pty', (event) => {
        if (event.payload.id === ptyId && terminal) {
          const data = new Uint8Array(event.payload.data);
          terminal.write(data);
        }
      });

      // Handle user input
      terminal.onData((data) => {
        if (ptyId) {
          const bytes = new TextEncoder().encode(data);
          invoke('plugin:pty|write', { id: ptyId, data: Array.from(bytes) });
        }
      });

      // Initial resize
      await resizePty();
    } catch (err) {
      console.error('[Terminal] Failed to spawn PTY:', err);
      terminal?.write(`\r\nError: Failed to spawn terminal - ${err}\r\n`);
    }

    // Handle resize
    resizeObserver = new ResizeObserver(() => {
      if (fitAddon && terminal) {
        fitAddon.fit();
        resizePty();
      }
    });
    resizeObserver.observe(terminalEl);
  });

  async function resizePty() {
    if (ptyId && terminal) {
      try {
        await invoke('plugin:pty|resize', {
          id: ptyId,
          cols: terminal.cols,
          rows: terminal.rows
        });
      } catch (err) {
        console.error('[Terminal] Failed to resize PTY:', err);
      }
    }
  }

  onDestroy(async () => {
    resizeObserver?.disconnect();
    unlistenOutput?.();

    if (ptyId) {
      try {
        await invoke('plugin:pty|kill', { id: ptyId });
      } catch (err) {
        console.error('[Terminal] Failed to kill PTY:', err);
      }
      terminalStore.setActiveTerminalId(null);
    }

    terminal?.dispose();
  });

  // Public method to focus terminal
  export function focus() {
    terminal?.focus();
  }
</script>

<div class="terminal-container" bind:this={terminalEl}></div>

<style>
  .terminal-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .terminal-container :global(.xterm) {
    height: 100%;
    padding: 8px;
  }

  .terminal-container :global(.xterm-viewport) {
    overflow-y: auto !important;
  }
</style>
