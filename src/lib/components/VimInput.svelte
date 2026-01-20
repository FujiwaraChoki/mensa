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

  // Use refs to avoid stale closure issues - callbacks are accessed via these refs
  // which always point to the current callback values
  let onsubmitRef = $derived(onsubmit);
  let oninputRef = $derived(oninput);
  let onpasteRef = $derived(onpaste);
  let onmodechangeRef = $derived(onmodechange);

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

  // Update theme when it changes - explicitly depend on effectiveTheme
  $effect(() => {
    const _theme = effectiveTheme; // Explicit dependency
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

  // Track if this instance has registered mappings for cleanup
  let hasRegisteredMappings = false;

  onMount(() => {
    // Map jj to Escape in insert mode
    // Note: Vim mappings are global, but we track registration for potential cleanup
    Vim.map('jj', '<Esc>', 'insert');

    // Custom command to send message on Enter in normal mode
    // Use a unique action name based on component instance to avoid conflicts
    const actionName = 'sendMessage_' + crypto.randomUUID().slice(0, 8);
    Vim.defineAction(actionName, () => {
      // Access via ref to avoid stale closure
      onsubmitRef();
    });
    Vim.mapCommand('<CR>', 'action', actionName, {}, { context: 'normal' });
    hasRegisteredMappings = true;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        value = update.state.doc.toString();
        // Access via ref to get current callback, not stale closure
        oninputRef?.();
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
              // Access via ref to get current callback
              onmodechangeRef?.(newMode);
            }
          }
        }
      }
    });

    // Handle paste events - use ref to avoid stale closure
    const pasteHandler = EditorView.domEventHandlers({
      paste: (event) => {
        onpasteRef?.(event);
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
    // Destroy the editor view - this cleans up all extensions and event listeners
    if (view) {
      view.destroy();
      view = null;
    }
    // Note: Vim mappings are global singletons in @replit/codemirror-vim
    // We can't easily unregister them, but using unique action names prevents conflicts
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
