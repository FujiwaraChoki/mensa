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
    onmodechange?: (mode: 'normal' | 'insert' | 'visual') => void;
  }

  let { value = $bindable(''), placeholder = 'Message Claude...', disabled = false, onsubmit, oninput, onpaste, onmodechange }: Props = $props();

  let editorContainer: HTMLDivElement;
  let view: EditorView | null = null;
  let currentVimMode = $state<'normal' | 'insert' | 'visual'>('normal');
  const themeCompartment = new Compartment();

  // Expose vim mode for parent component
  export function getVimMode() {
    return currentVimMode;
  }
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
    // Read value first to ensure it's tracked as a dependency
    const currentValue = value;
    if (view && view.state.doc.toString() !== currentValue) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: currentValue }
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
            let newMode: 'normal' | 'insert' | 'visual' = 'normal';
            if (vimState.visualMode) {
              newMode = 'visual';
            } else if (vimState.insertMode) {
              newMode = 'insert';
            }
            if (newMode !== currentVimMode) {
              currentVimMode = newMode;
              onmodechange?.(newMode);
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

<div class="vim-editor" class:disabled bind:this={editorContainer}></div>

<style>
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
