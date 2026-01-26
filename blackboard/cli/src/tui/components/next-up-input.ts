/**
 * Next-up input overlay component for creating new next-ups.
 * Displayed at the bottom of the screen when active.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Computed } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState } from "../state.ts";

export interface NextUpInputOptions {
  tui: Tui;
  state: TuiState;
  onTitleChange: (title: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Create the next-up input overlay.
 * Returns cleanup function to destroy components.
 */
export function createNextUpInput(options: NextUpInputOptions): () => void {
  const { tui, state, onTitleChange, onConfirm, onCancel } = options;
  const components: (Text | Box)[] = [];

  const size = tui.canvas.size.value;
  const row = size.rows - 2; // Position above status bar

  // Background bar
  const bar = new Box({
    parent: tui,
    theme: { base: crayon.bgGreen },
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
    text: " New next-up: ",
    theme: { base: crayon.bgGreen.white.bold },
    rectangle: {
      column: 0,
      row,
    },
    zIndex: 51,
  });
  components.push(promptText);

  // Title input text
  const titleText = new Computed(() => {
    const title = state.newNextUpTitle.value || "";

    // Show cursor at end of title
    const cursor = "\u2588"; // Block cursor
    const displayText = title + cursor;

    return displayText;
  });

  const titleTextComponent = new Text({
    parent: tui,
    text: titleText,
    theme: { base: crayon.bgGreen.white },
    rectangle: {
      column: 14, // After "New next-up: "
      row,
    },
    zIndex: 51,
  });
  components.push(titleTextComponent);

  // Hint text
  const hintText = new Text({
    parent: tui,
    text: " | Enter:create Esc:cancel",
    theme: { base: crayon.bgGreen.lightBlack },
    rectangle: {
      column: size.columns - 28,
      row,
    },
    zIndex: 51,
  });
  components.push(hintText);

  // Skip the first event (the 'n' that triggered creation)
  let skipFirstEvent = true;

  // Key handler for input
  const keyHandler = (event: any) => {
    // Skip the triggering event
    if (skipFirstEvent) {
      skipFirstEvent = false;
      return;
    }

    const key = event.key;

    if (!state.isCreatingNextUp.value) return;

    // Handle special keys
    if (key === "escape") {
      onCancel();
      return;
    }

    // Handle backspace
    if (key === "backspace") {
      const currentTitle = state.newNextUpTitle.value;
      if (currentTitle.length > 0) {
        onTitleChange(currentTitle.slice(0, -1));
      }
      return;
    }

    // Handle return/enter
    if (key === "return") {
      onConfirm();
      return;
    }

    // Handle printable characters (allow all printable characters for title)
    if (key && key.length === 1) {
      const currentTitle = state.newNextUpTitle.value;
      onTitleChange(currentTitle + key);
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
