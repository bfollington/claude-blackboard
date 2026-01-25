/**
 * Main TUI entry point for the blackboard dashboard.
 * Provides an interactive terminal interface for managing threads, plans, steps, and breadcrumbs.
 */

import { Tui, handleInput, handleKeyboardControls, handleMouseControls, Signal } from "https://deno.land/x/tui@2.1.11/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";

export interface TuiOptions {
  db?: string;
}

/**
 * Launch the interactive TUI dashboard.
 * Returns when user quits (q or Ctrl+C).
 */
export async function launchTui(options: TuiOptions): Promise<void> {
  const tui = new Tui({
    style: crayon.bgBlack,
    refreshRate: 1000 / 60, // 60 FPS
  });

  // Enable input handling
  handleInput(tui);
  handleKeyboardControls(tui);
  handleMouseControls(tui);

  // Track if we should quit
  const shouldQuit = new Signal(false);

  // Handle quit on 'q' or Ctrl+C
  tui.on("keyPress", (event) => {
    if (event.key === "q" || (event.ctrl && event.key === "c")) {
      shouldQuit.value = true;
    }
  });

  // Run the TUI
  tui.run();

  // Wait for quit signal
  await new Promise<void>((resolve) => {
    const checkQuit = setInterval(() => {
      if (shouldQuit.value) {
        clearInterval(checkQuit);
        resolve();
      }
    }, 50);
  });

  // Clean shutdown
  tui.destroy();
}
