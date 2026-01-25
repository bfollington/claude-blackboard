/**
 * Find input overlay component for searching content.
 * Displayed at the bottom of the screen when active.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Computed } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState } from "../state.ts";

export interface FindInputOptions {
  tui: Tui;
  state: TuiState;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onExit: () => void;
  onClear: () => void;
}

/**
 * Create the find input overlay.
 * Returns cleanup function to destroy components.
 */
export function createFindInput(options: FindInputOptions): () => void {
  const { tui, state, onQueryChange, onNext, onPrevious, onExit, onClear } = options;
  const components: (Text | Box)[] = [];

  const size = tui.canvas.size.value;
  const row = size.rows - 2; // Position above status bar

  // Background bar
  const bar = new Box({
    parent: tui,
    theme: { base: crayon.bgBlue },
    rectangle: {
      column: 0,
      row,
      width: size.columns,
      height: 1,
    },
    zIndex: 50,
  });
  components.push(bar);

  // Prompt text
  const promptText = new Text({
    parent: tui,
    text: " Find: ",
    theme: { base: crayon.bgBlue.white.bold },
    rectangle: {
      column: 0,
      row,
    },
    zIndex: 51,
  });
  components.push(promptText);

  // Query text with match counter
  const queryText = new Computed(() => {
    const find = state.findState.value;
    const query = find.query || "";
    const matchInfo = find.matches.length > 0
      ? ` [${find.currentMatchIndex + 1}/${find.matches.length}]`
      : find.query
      ? " [0/0]"
      : "";

    // Show cursor at end of query
    const cursor = "\u2588"; // Block cursor
    const displayText = query + cursor;

    return displayText + matchInfo;
  });

  const queryTextComponent = new Text({
    parent: tui,
    text: queryText,
    theme: { base: crayon.bgBlue.white },
    rectangle: {
      column: 7, // After "Find: "
      row,
    },
    zIndex: 51,
  });
  components.push(queryTextComponent);

  // Hint text
  const hintText = new Text({
    parent: tui,
    text: " | Enter:confirm Esc:cancel",
    theme: { base: crayon.bgBlue.lightBlack },
    rectangle: {
      column: size.columns - 28,
      row,
    },
    zIndex: 51,
  });
  components.push(hintText);

  // Key handler for input
  const keyHandler = (event: any) => {
    const key = event.key;
    const find = state.findState.value;

    if (!find.isActive) return;

    // Handle special keys
    if (key === "escape") {
      onClear();
      return;
    }

    // Handle backspace
    if (key === "backspace") {
      if (find.query.length > 0) {
        onQueryChange(find.query.slice(0, -1));
      }
      return;
    }

    // Handle return/enter (exit find mode, keeping matches for n/N navigation)
    if (key === "return") {
      onExit();
      return;
    }

    // Handle printable characters
    // Skip '/' if query is empty (it's the activation key)
    if (key && key.length === 1 && !(key === "/" && find.query === "")) {
      onQueryChange(find.query + key);
    }
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
