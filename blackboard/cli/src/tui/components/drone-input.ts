/**
 * Drone input overlay component for creating new drones.
 * Displayed at the bottom of the screen when active.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Computed } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState } from "../state.ts";

export interface DroneInputOptions {
  tui: Tui;
  state: TuiState;
  onNameChange: (name: string) => void;
  onPromptChange: (prompt: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Create the drone input overlay.
 * Returns cleanup function to destroy components.
 */
export function createDroneInput(options: DroneInputOptions): () => void {
  const { tui, state, onNameChange, onPromptChange, onConfirm, onCancel } = options;
  const components: (Text | Box)[] = [];

  const size = tui.canvas.size.value;
  const nameRow = size.rows - 4; // Name input row
  const promptRow = size.rows - 3; // Prompt input row
  const hintRow = size.rows - 2; // Hint row

  // Background bars
  const nameBar = new Box({
    parent: tui,
    theme: { base: crayon.bgGreen },
    rectangle: {
      column: 0,
      row: nameRow,
      width: size.columns,
      height: 1,
    },
    zIndex: 50,
  });
  components.push(nameBar);

  const promptBar = new Box({
    parent: tui,
    theme: { base: crayon.bgGreen },
    rectangle: {
      column: 0,
      row: promptRow,
      width: size.columns,
      height: 1,
    },
    zIndex: 50,
  });
  components.push(promptBar);

  const hintBar = new Box({
    parent: tui,
    theme: { base: crayon.bgGreen },
    rectangle: {
      column: 0,
      row: hintRow,
      width: size.columns,
      height: 1,
    },
    zIndex: 50,
  });
  components.push(hintBar);

  // Name input
  const namePromptText = new Text({
    parent: tui,
    text: " Name: ",
    theme: { base: crayon.bgGreen.white.bold },
    rectangle: {
      column: 0,
      row: nameRow,
    },
    zIndex: 51,
  });
  components.push(namePromptText);

  const nameText = new Computed(() => {
    const name = state.newDroneName.value || "";
    const cursor = "\u2588"; // Block cursor
    return name + cursor;
  });

  const nameTextComponent = new Text({
    parent: tui,
    text: nameText,
    theme: { base: crayon.bgGreen.white },
    rectangle: {
      column: 7, // After "Name: "
      row: nameRow,
    },
    zIndex: 51,
  });
  components.push(nameTextComponent);

  // Prompt input
  const promptPromptText = new Text({
    parent: tui,
    text: " Prompt: ",
    theme: { base: crayon.bgGreen.white.bold },
    rectangle: {
      column: 0,
      row: promptRow,
    },
    zIndex: 51,
  });
  components.push(promptPromptText);

  const promptText = new Computed(() => {
    const prompt = state.newDronePrompt.value || "";
    const maxLen = size.columns - 12; // Leave space for label
    const truncated = prompt.length > maxLen ? prompt.slice(0, maxLen - 1) + "~" : prompt;
    return truncated;
  });

  const promptTextComponent = new Text({
    parent: tui,
    text: promptText,
    theme: { base: crayon.bgGreen.white },
    rectangle: {
      column: 9, // After "Prompt: "
      row: promptRow,
    },
    zIndex: 51,
  });
  components.push(promptTextComponent);

  // Hint text
  const hintText = new Text({
    parent: tui,
    text: " Tab:switch Enter:create Esc:cancel",
    theme: { base: crayon.bgGreen.lightBlack },
    rectangle: {
      column: 0,
      row: hintRow,
    },
    zIndex: 51,
  });
  components.push(hintText);

  // Track which field is focused (name or prompt)
  let focusedField: "name" | "prompt" = "name";

  // Skip the first event (the 'n' that triggered creation)
  let skipFirstEvent = true;

  // Key handler for input
  const keyHandler = (event: any) => {
    // Skip the triggering event
    if (skipFirstEvent) {
      skipFirstEvent = false;
      return;
    }

    // Escape cancels
    if (event.key === "escape") {
      onCancel();
      return;
    }

    // Tab switches fields
    if (event.key === "tab") {
      focusedField = focusedField === "name" ? "prompt" : "name";
      return;
    }

    // Enter confirms
    if (event.key === "return") {
      onConfirm();
      return;
    }

    // Get current value
    const currentValue = focusedField === "name" ? state.newDroneName.value : state.newDronePrompt.value;
    const updateFn = focusedField === "name" ? onNameChange : onPromptChange;

    // Handle backspace
    if (event.key === "backspace") {
      if (currentValue.length > 0) {
        updateFn(currentValue.slice(0, -1));
      }
      return;
    }

    // Handle printable characters
    if (event.key && event.key.length === 1) {
      updateFn(currentValue + event.key);
      return;
    }

    // Handle space
    if (event.key === "space") {
      updateFn(currentValue + " ");
      return;
    }
  };

  // Register key handler
  tui.on("keyPress", keyHandler);

  // Return cleanup function
  return () => {
    tui.off("keyPress", keyHandler);
    for (const component of components) {
      component.destroy();
    }
  };
}
