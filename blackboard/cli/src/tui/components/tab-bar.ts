/**
 * Tab bar component for navigating between main views.
 * Displays tabs for Threads, Bugs, and Reflections.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Computed, Signal } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
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
  { id: "next-ups", label: "Next-Ups", shortcut: "4" },
  { id: "drones", label: "Drones", shortcut: "5" },
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

  // Create each tab - we need to recreate tabs when active tab changes
  // since deno_tui doesn't support dynamic theme changes
  let column = 1;
  const tabComponents: Text[] = [];
  const tabPositions: { column: number; width: number; tab: TabConfig }[] = [];

  // Calculate positions first
  for (const tab of TABS) {
    const tabLabel = `[${tab.shortcut}] ${tab.label}`;
    const width = tabLabel.length + 2; // +2 for padding spaces
    tabPositions.push({ column, width, tab });
    column += width + 1; // +1 for gap between tabs
  }

  // Function to create/recreate tab text components
  const renderTabs = () => {
    // Destroy existing tab components
    for (const comp of tabComponents) {
      comp.destroy();
      const idx = components.indexOf(comp);
      if (idx !== -1) components.splice(idx, 1);
    }
    tabComponents.length = 0;

    // Create new tab components with current styling
    for (const { column: col, tab } of tabPositions) {
      const isActive = state.activeTab.value === tab.id;
      const tabLabel = `[${tab.shortcut}] ${tab.label}`;
      const theme = isActive
        ? { base: crayon.bgWhite.black.bold }
        : { base: crayon.bgBlack.white };

      const text = new Text({
        parent: tui,
        text: ` ${tabLabel} `,
        theme,
        rectangle: { column: col, row },
        zIndex: 2,
      });
      tabComponents.push(text);
      components.push(text);
    }
  };

  // Initial render
  renderTabs();

  // Re-render tabs when active tab changes
  state.activeTab.subscribe(() => {
    renderTabs();
  });

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
