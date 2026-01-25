/**
 * Status bar component showing current context and available keybindings.
 * Displayed at the bottom of the screen.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Signal, Computed } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState, PaneId } from "../state.ts";

export interface StatusBarOptions {
  tui: Tui;
  state: TuiState;
  row: number;
  width: number;
}

// Keybinding hints for each pane
const PANE_HINTS: Record<PaneId, string> = {
  list: "j/k:nav a:archive p:pause Tab:focus",
  plan: "e:edit Tab:focus",
  steps: "j/k:nav Space:toggle e:edit J/K:reorder Tab:focus",
  crumbs: "j/k:nav e:edit Tab:focus",
};

// Pane display names
const PANE_NAMES: Record<PaneId, string> = {
  list: "THREADS",
  plan: "PLAN",
  steps: "STEPS",
  crumbs: "CRUMBS",
};

/**
 * Create the status bar component.
 * Returns cleanup function to destroy components.
 */
export function createStatusBar(options: StatusBarOptions): () => void {
  const { tui, state, row, width } = options;
  const components: (Text | Box)[] = [];

  // Background bar
  const bar = new Box({
    parent: tui,
    theme: { base: crayon.bgLightBlack },
    rectangle: {
      column: 0,
      row,
      width,
      height: 1,
    },
    zIndex: 10,
  });
  components.push(bar);

  // Status text signal
  const statusText = new Signal<string>("");

  // Update status text based on state
  const updateStatus = () => {
    const thread = state.selectedThread.value;
    const pane = state.focusedPane.value;
    const message = state.statusMessage.value;

    // Build status line
    const parts: string[] = [];

    // Thread name
    if (thread) {
      parts.push(crayon.white.bold(thread.name));
    } else {
      parts.push(crayon.lightBlack("No thread selected"));
    }

    // Separator
    parts.push(crayon.lightBlack(" | "));

    // Current pane
    parts.push(crayon.cyan(PANE_NAMES[pane]));

    // Separator
    parts.push(crayon.lightBlack(" | "));

    // Keybinding hints
    parts.push(crayon.lightBlack(PANE_HINTS[pane]));

    // Global hints
    parts.push(crayon.lightBlack(" ?:help q:quit"));

    // Status message (if any)
    if (message) {
      parts.push(crayon.lightBlack(" | "));
      parts.push(crayon.yellow(message));
    }

    statusText.value = " " + parts.join("");
  };

  // Create status text component
  const statusTextComponent = new Text({
    parent: tui,
    text: statusText,
    theme: { base: crayon.bgLightBlack.white },
    rectangle: {
      column: 0,
      row,
    },
    zIndex: 11,
  });
  components.push(statusTextComponent);

  // Subscribe to state changes
  state.selectedThread.subscribe(updateStatus);
  state.focusedPane.subscribe(updateStatus);
  state.statusMessage.subscribe(updateStatus);

  // Initial render
  updateStatus();

  // Return cleanup function
  return () => {
    for (const component of components) {
      component.destroy();
    }
  };
}

/**
 * Create a help overlay showing all keybindings.
 * Returns cleanup function to destroy components.
 */
export function createHelpOverlay(options: {
  tui: Tui;
  onClose: () => void;
}): () => void {
  const { tui, onClose } = options;
  const components: (Text | Box)[] = [];

  const size = tui.canvas.size.value;
  const overlayWidth = 50;
  const overlayHeight = 20;
  const startCol = Math.floor((size.columns - overlayWidth) / 2);
  const startRow = Math.floor((size.rows - overlayHeight) / 2);

  // Overlay background
  const bg = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: {
      column: startCol,
      row: startRow,
      width: overlayWidth,
      height: overlayHeight,
    },
    zIndex: 100,
  });
  components.push(bg);

  // Help content
  const helpLines = [
    crayon.white.bold("  BLACKBOARD DASHBOARD HELP"),
    "",
    crayon.cyan("  Global:"),
    "    1/2/3     Switch tabs (Threads/Bugs/Reflections)",
    "    Tab       Cycle focus between panes",
    "    q         Quit dashboard",
    "    ?         Toggle this help",
    "",
    crayon.cyan("  Thread List:"),
    "    j/k       Navigate threads",
    "    a         Archive selected thread",
    "    p         Pause/resume thread",
    "",
    crayon.cyan("  Steps:"),
    "    j/k       Navigate steps",
    "    Space     Toggle step complete/pending",
    "    e         Edit step in $EDITOR",
    "    J/K       Move step up/down",
    "",
    crayon.lightBlack("  Press any key to close"),
  ];

  for (let i = 0; i < helpLines.length && i < overlayHeight - 2; i++) {
    const text = new Text({
      parent: tui,
      text: helpLines[i] || "",
      theme: { base: crayon.bgBlack.white },
      rectangle: {
        column: startCol + 1,
        row: startRow + 1 + i,
      },
      zIndex: 101,
    });
    components.push(text);
  }

  // Listen for any key to close
  const keyHandler = () => {
    onClose();
  };
  tui.on("keyPress", keyHandler);

  // Return cleanup function
  return () => {
    tui.off("keyPress", keyHandler);
    for (const component of components) {
      component.destroy();
    }
  };
}
