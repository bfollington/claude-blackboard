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
  list: "j/k:nav a:archive p:pause /:find Tab:focus",
  plan: "o:open i:import /:find Tab:focus",
  steps: "j/k:nav Space:toggle o:open i:import J/K:reorder /:find Tab:focus",
  crumbs: "j/k:nav o:open i:import /:find Tab:focus",
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

  // Status text - plain text, styled by theme
  const statusText = new Computed(() => {
    const thread = state.selectedThread.value;
    const pane = state.focusedPane.value;
    const message = state.statusMessage.value;

    // Build plain text status line
    const parts: string[] = [];

    // Thread name
    parts.push(thread ? thread.name : "No thread");

    // Separator and pane
    parts.push(" | ");
    parts.push(PANE_NAMES[pane]);

    // Separator and hints
    parts.push(" | ");
    parts.push(PANE_HINTS[pane]);
    parts.push(" | q:quit");

    // Status message (if any)
    if (message) {
      parts.push(" | ");
      parts.push(message);
    }

    // Pad to width
    const text = " " + parts.join("");
    if (text.length < width) {
      return text + " ".repeat(width - text.length);
    }
    return text.slice(0, width);
  });

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
    "    o         Open in external app",
    "    i         Import changes from open file",
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
