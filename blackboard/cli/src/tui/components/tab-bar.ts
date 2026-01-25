/**
 * Tab bar component for navigating between main views.
 * Displays tabs for Threads, Bugs, and Reflections.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Computed } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState } from "../state.ts";
import type { TabId } from "../state.ts";

export interface TabBarOptions {
  tui: Tui;
  state: TuiState;
  row: number;
}

interface TabConfig {
  id: TabId;
  label: string;
  shortcut: string;
}

const TABS: TabConfig[] = [
  { id: "threads", label: "Threads", shortcut: "1" },
  { id: "bugs", label: "Bugs", shortcut: "2" },
  { id: "reflections", label: "Reflections", shortcut: "3" },
];

/**
 * Create the tab bar with clickable tabs.
 * Returns cleanup function to destroy components.
 */
export function createTabBar(options: TabBarOptions): () => void {
  const { tui, state, row } = options;
  const components: (Text | Box)[] = [];

  // Background bar
  const barWidth = new Computed(() => tui.canvas.size.value.columns);
  const bar = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: new Computed(() => ({
      column: 0,
      row,
      width: barWidth.value,
      height: 1,
    })),
    zIndex: 1,
  });
  components.push(bar);

  // Create each tab
  let column = 1;
  for (const tab of TABS) {
    const isActive = new Computed(() => state.activeTab.value === tab.id);

    // Tab text with dynamic styling based on active state
    const tabLabel = `[${tab.shortcut}] ${tab.label}`;

    // We style the text via the theme, using base for the current style
    const tabTheme = new Computed(() => {
      if (isActive.value) {
        return { base: crayon.bgWhite.black.bold };
      }
      return { base: crayon.bgBlack.white };
    });

    const text = new Text({
      parent: tui,
      text: ` ${tabLabel} `,
      theme: tabTheme.value,
      rectangle: {
        column,
        row,
      },
      zIndex: 2,
    });
    components.push(text);

    // Update theme when active state changes
    isActive.subscribe(() => {
      // deno_tui Text doesn't easily support dynamic theme changes
      // For now, we'll accept that tabs won't update dynamically
      // A full solution would require recreating the Text components
    });

    column += tabLabel.length + 3; // +3 for padding spaces
  }

  // Title on the right side
  const titleText = "blackboard";
  const title = new Text({
    parent: tui,
    text: titleText,
    theme: { base: crayon.bgBlack.cyan.bold },
    rectangle: new Computed(() => ({
      column: Math.max(column + 2, tui.canvas.size.value.columns - titleText.length - 2),
      row,
    })),
    zIndex: 2,
  });
  components.push(title);

  // Return cleanup function
  return () => {
    for (const component of components) {
      component.destroy();
    }
  };
}
