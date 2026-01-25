/**
 * Confirmation dialog overlay component.
 * Displays a yes/no confirmation dialog at the bottom of the screen.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";

export interface ConfirmDialogOptions {
  tui: Tui;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Create the confirmation dialog overlay.
 * Returns cleanup function to destroy components.
 */
export function createConfirmDialog(options: ConfirmDialogOptions): () => void {
  const { tui, message, onConfirm, onCancel } = options;
  const components: (Text | Box)[] = [];

  const size = tui.canvas.size.value;
  const row = size.rows - 2; // Position above status bar

  // Background bar
  const bar = new Box({
    parent: tui,
    theme: { base: crayon.bgYellow },
    rectangle: {
      column: 0,
      row,
      width: size.columns,
      height: 1,
    },
    zIndex: 50,
  });
  components.push(bar);

  // Message text
  const messageText = new Text({
    parent: tui,
    text: ` ${message} `,
    theme: { base: crayon.bgYellow.black.bold },
    rectangle: {
      column: 0,
      row,
    },
    zIndex: 51,
  });
  components.push(messageText);

  // Hint text
  const hintText = new Text({
    parent: tui,
    text: " y:yes n/Esc:no ",
    theme: { base: crayon.bgYellow.lightBlack },
    rectangle: {
      column: size.columns - 17,
      row,
    },
    zIndex: 51,
  });
  components.push(hintText);

  // Key handler for confirmation
  const keyHandler = (event: any) => {
    const key = event.key;

    // Confirm with 'y' or 'Y'
    if (key === "y" || key === "Y") {
      cleanup();
      onConfirm();
      return;
    }

    // Cancel with 'n', 'N', or Escape
    if (key === "n" || key === "N" || key === "escape") {
      cleanup();
      onCancel();
      return;
    }
  };

  tui.on("keyPress", keyHandler);

  // Return cleanup function
  const cleanup = () => {
    tui.off("keyPress", keyHandler);
    for (const component of components) {
      component.destroy();
    }
  };

  return cleanup;
}
