// mensa - Terminal State Management (Svelte 5 Runes)

function createTerminalStore() {
  let activeTerminalId = $state<string | null>(null);
  let isVisible = $state(false);
  let panelHeight = $state(300); // Default height in pixels

  return {
    get activeTerminalId() { return activeTerminalId; },
    get isVisible() { return isVisible; },
    get panelHeight() { return panelHeight; },

    setActiveTerminalId(id: string | null) {
      activeTerminalId = id;
    },

    toggle() {
      isVisible = !isVisible;
    },

    show() {
      isVisible = true;
    },

    hide() {
      isVisible = false;
    },

    setPanelHeight(height: number) {
      // Clamp between min and max
      panelHeight = Math.max(150, Math.min(600, height));
    }
  };
}

export const terminalStore = createTerminalStore();
