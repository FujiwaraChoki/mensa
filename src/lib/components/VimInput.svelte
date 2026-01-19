<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { EditorView, drawSelection, placeholder as cmPlaceholder } from '@codemirror/view';
  import { EditorState, Compartment } from '@codemirror/state';
  import { vim, Vim, getCM } from '@replit/codemirror-vim';
  import { getEffectiveTheme } from '$lib/services/theme';
  import { appConfig } from '$lib/stores/app.svelte';

  interface Props {
    value: string;
    placeholder?: string;
    disabled?: boolean;
    onsubmit: () => void;
    oninput?: () => void;
    onpaste?: (e: ClipboardEvent) => void;
  }

  let { value = $bindable(''), placeholder = 'Message Claude...', disabled = false, onsubmit, oninput, onpaste }: Props = $props();

  let editorContainer: HTMLDivElement;
  let view: EditorView | null = null;
  let vimMode = $state<'normal' | 'insert' | 'visual'>('normal');
  const themeCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();

  // Reactive theme
  const effectiveTheme = $derived(getEffectiveTheme(appConfig.theme));

  // Light theme for CodeMirror
  const lightTheme = EditorView.theme({
    '&': {
      backgroundColor: 'var(--gray-50)',
      color: 'var(--off-black)',
      fontSize: 'var(--text-base)',
      fontFamily: 'var(--font-sans)',
    },
    '.cm-content': {
      caretColor: 'var(--off-black)',
      padding: '10px 12px',
      minHeight: '20px',
      maxHeight: '200px',
    },
    '.cm-line': {
      padding: '0',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--off-black)',
      borderLeftWidth: '2px',
    },
    '.cm-cursor-primary': {
      borderLeftColor: 'var(--off-black)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      overflow: 'auto',
      maxHeight: '200px',
    },
    '.cm-placeholder': {
      color: 'var(--gray-400)',
    },
    // Vim cursor styles
    '.cm-fat-cursor': {
      background: 'var(--off-black) !important',
      color: 'var(--white) !important',
    },
    '.cm-cursor-secondary': {
      borderLeftColor: 'var(--gray-400)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(10, 10, 10, 0.15)',
    },
  }, { dark: false });

  // Dark theme for CodeMirror
  const darkTheme = EditorView.theme({
    '&': {
      backgroundColor: 'var(--gray-50)',
      color: 'var(--off-black)',
      fontSize: 'var(--text-base)',
      fontFamily: 'var(--font-sans)',
    },
    '.cm-content': {
      caretColor: 'var(--off-black)',
      padding: '10px 12px',
      minHeight: '20px',
      maxHeight: '200px',
    },
    '.cm-line': {
      padding: '0',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--off-black)',
      borderLeftWidth: '2px',
    },
    '.cm-cursor-primary': {
      borderLeftColor: 'var(--off-black)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      overflow: 'auto',
      maxHeight: '200px',
    },
    '.cm-placeholder': {
      color: 'var(--gray-400)',
    },
    // Vim cursor styles
    '.cm-fat-cursor': {
      background: 'var(--off-black) !important',
      color: 'var(--white) !important',
    },
    '.cm-cursor-secondary': {
      borderLeftColor: 'var(--gray-400)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
  }, { dark: true });

  function getThemeExtension() {
    return effectiveTheme === 'dark' ? darkTheme : lightTheme;
  }

  // Update editor content from external value changes
  $effect(() => {
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value }
      });
    }
  });

  // Update theme when it changes
  $effect(() => {
    if (view) {
      view.dispatch({
        effects: themeCompartment.reconfigure(getThemeExtension())
      });
    }
  });

  // Update disabled state
  $effect(() => {
    if (view) {
      view.dispatch({
        effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(disabled))
      });
    }
  });

  onMount(() => {
    // Map jj to Escape in insert mode
    Vim.map('jj', '<Esc>', 'insert');

    // Custom command to send message on Enter in normal mode
    Vim.defineAction('sendMessage', () => {
      onsubmit();
    });
    Vim.mapCommand('<CR>', 'action', 'sendMessage', {}, { context: 'normal' });

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        value = update.state.doc.toString();
        oninput?.();
      }

      // Track vim mode changes
      if (view) {
        const cm = getCM(view);
        if (cm) {
          const state = cm.state;
          if (state.vim) {
            const vimState = state.vim as { visualMode?: boolean; insertMode?: boolean };
            if (vimState.visualMode) {
              vimMode = 'visual';
            } else if (vimState.insertMode) {
              vimMode = 'insert';
            } else {
              vimMode = 'normal';
            }
          }
        }
      }
    });

    // Handle paste events
    const pasteHandler = EditorView.domEventHandlers({
      paste: (event) => {
        onpaste?.(event);
        return false; // Let CodeMirror handle the paste
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        vim(),
        themeCompartment.of(getThemeExtension()),
        readOnlyCompartment.of(EditorState.readOnly.of(disabled)),
        drawSelection(),
        cmPlaceholder(placeholder),
        updateListener,
        pasteHandler,
        EditorView.lineWrapping,
      ]
    });

    view = new EditorView({
      state,
      parent: editorContainer
    });

    // Focus the editor
    view.focus();
  });

  onDestroy(() => {
    view?.destroy();
  });

  export function focus() {
    view?.focus();
  }

  export function getView() {
    return view;
  }
</script>

<div class="vim-input-wrapper">
  <div class="vim-mode-indicator" class:insert={vimMode === 'insert'} class:visual={vimMode === 'visual'}>
    {#if vimMode === 'normal'}
      NORMAL
    {:else if vimMode === 'insert'}
      INSERT
    {:else if vimMode === 'visual'}
      VISUAL
    {/if}
  </div>
  <div class="vim-editor" class:disabled bind:this={editorContainer}></div>
</div>

<style>
  .vim-input-wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .vim-mode-indicator {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    background: var(--gray-200);
    color: var(--gray-500);
    align-self: flex-start;
    margin-bottom: 4px;
    transition: all var(--transition-fast);
  }

  .vim-mode-indicator.insert {
    background: rgba(34, 197, 94, 0.15);
    color: rgb(22, 163, 74);
  }

  .vim-mode-indicator.visual {
    background: rgba(168, 85, 247, 0.15);
    color: rgb(147, 51, 234);
  }

  .vim-editor {
    flex: 1;
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .vim-editor.disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  .vim-editor :global(.cm-editor) {
    height: 100%;
    border-radius: var(--radius-md);
  }

  .vim-editor :global(.cm-focused) {
    outline: none;
  }
</style>
