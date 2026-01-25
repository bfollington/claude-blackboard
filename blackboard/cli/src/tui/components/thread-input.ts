/**
 * Thread input overlay component for creating new threads.
 * Displayed at the bottom of the screen when active.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Computed } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState } from "../state.ts";

export interface ThreadInputOptions {
  tui: Tui;
  state: TuiState;
  onNameChange: (name: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Create the thread input overlay.
 * Returns cleanup function to destroy components.
 */
export function createThreadInput(options: ThreadInputOptions): () => void {
  const { tui, state, onNameChange, onConfirm, onCancel } = options;
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
    text: " New thread: ",
    theme: { base: crayon.bgGreen.white.bold },
    rectangle: {
      column: 0,
      row,
    },
    zIndex: 51,
  });
  components.push(promptText);

  // Name input text
  const nameText = new Computed(() => {
    const name = state.newThreadName.value || "";

    // Show cursor at end of name
    const cursor = "\u2588"; // Block cursor
    const displayText = name + cursor;

    return displayText;
  });

  const nameTextComponent = new Text({
    parent: tui,
    text: nameText,
    theme: { base: crayon.bgGreen.white },
    rectangle: {
      column: 13, // After "New thread: "
      row,
    },
    zIndex: 51,
  });
  components.push(nameTextComponent);

  // Hint text
  const hintText = new Text({
    parent: tui,
    text: " | Enter:create Esc:cancel | Use kebab-case",
    theme: { base: crayon.bgGreen.lightBlack },
    rectangle: {
      column: size.columns - 46,
      row,
    },
    zIndex: 51,
  });
  components.push(hintText);

  // Key handler for input
  const keyHandler = (event: any) => {
    const key = event.key;

    if (!state.isCreatingThread.value) return;

    // Handle special keys
    if (key === "escape") {
      onCancel();
      return;
    }

    // Handle backspace
    if (key === "backspace") {
      const currentName = state.newThreadName.value;
      if (currentName.length > 0) {
        onNameChange(currentName.slice(0, -1));
      }
      return;
    }

    // Handle return/enter
    if (key === "return") {
      onConfirm();
      return;
    }

    // Handle printable characters (allow lowercase letters, numbers, and hyphens)
    if (key && key.length === 1) {
      const char = key.toLowerCase();
      const currentName = state.newThreadName.value;

      // Allow letters, numbers, and hyphens (enforce kebab-case input)
      if (/[a-z0-9-]/.test(char)) {
        // Don't allow hyphen at start or double hyphens
        if (char === '-' && (currentName.length === 0 || currentName.endsWith('-'))) {
          return;
        }
        onNameChange(currentName + char);
      }
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
