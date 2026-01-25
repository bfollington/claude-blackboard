/**
 * Thread list panel component.
 * Displays threads with status icons, pending step counts, and last updated time.
 * Supports keyboard navigation with j/k or arrow keys.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Computed, Signal } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState, ThreadListItem } from "../state.ts";

export interface ThreadListOptions {
  tui: Tui;
  state: TuiState;
  rectangle: {
    column: number;
    row: number;
    width: number;
    height: number;
  };
}

// Status icons for different thread states
const STATUS_ICONS: Record<string, string> = {
  active: "●",    // Filled circle - active
  paused: "○",    // Empty circle - paused
  completed: "✓", // Checkmark - completed
  archived: "◌",  // Dotted circle - archived
};

// Colors for status icons
const STATUS_COLORS: Record<string, (text: string) => string> = {
  active: (t) => crayon.green(t),
  paused: (t) => crayon.yellow(t),
  completed: (t) => crayon.cyan(t),
  archived: (t) => crayon.lightBlack(t),
};

/**
 * Create the thread list panel.
 * Returns cleanup function to destroy components.
 */
export function createThreadList(options: ThreadListOptions): () => void {
  const { tui, state, rectangle } = options;
  const components: (Text | Box)[] = [];

  // Panel background
  const panel = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: {
      column: rectangle.column,
      row: rectangle.row,
      width: rectangle.width,
      height: rectangle.height,
    },
    zIndex: 1,
  });
  components.push(panel);

  // Header
  const headerText = new Computed(() => {
    const filter = state.threadFilter.value;
    const filterLabel = filter === "all" ? "ALL" : filter.toUpperCase();
    return ` THREADS [${filterLabel}]`;
  });

  const header = new Text({
    parent: tui,
    text: headerText,
    theme: { base: crayon.bgBlack.white.bold },
    rectangle: {
      column: rectangle.column,
      row: rectangle.row,
    },
    zIndex: 2,
  });
  components.push(header);

  // Thread rows - we'll create a fixed number of row slots
  const maxVisibleRows = rectangle.height - 2; // -1 for header, -1 for bottom margin
  const rowTexts: Signal<string>[] = [];
  const rowComponents: Text[] = [];

  for (let i = 0; i < maxVisibleRows; i++) {
    const rowText = new Signal<string>("");
    rowTexts.push(rowText);

    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: {
        column: rectangle.column,
        row: rectangle.row + 1 + i,
      },
      zIndex: 2,
    });
    rowComponents.push(text);
    components.push(text);
  }

  // Update row content when thread list or selection changes
  const updateRows = () => {
    const items = state.threadListItems.value;
    const selectedIndex = state.selectedThreadIndex.value;
    const focusedOnList = state.focusedPane.value === "list";

    // Handle empty state
    if (items.length === 0) {
      const filter = state.threadFilter.value;
      const emptyMsg = filter === "all"
        ? " No threads yet"
        : ` No ${filter} threads`;
      const hintMsg = " Create with: blackboard thread new <name>";

      rowTexts[0].value = padLine(crayon.lightBlack(emptyMsg), rectangle.width);
      rowTexts[1].value = padLine(crayon.lightBlack(hintMsg), rectangle.width);
      for (let i = 2; i < maxVisibleRows; i++) {
        rowTexts[i].value = " ".repeat(rectangle.width);
      }
      return;
    }

    for (let i = 0; i < maxVisibleRows; i++) {
      if (i < items.length) {
        const item = items[i];
        const isSelected = i === selectedIndex;
        rowTexts[i].value = formatThreadRow(item, isSelected, focusedOnList, rectangle.width);
      } else {
        rowTexts[i].value = " ".repeat(rectangle.width);
      }
    }
  };

  // Subscribe to state changes
  state.threadListItems.subscribe(updateRows);
  state.selectedThreadIndex.subscribe(updateRows);
  state.focusedPane.subscribe(updateRows);
  state.threadFilter.subscribe(updateRows);

  // Initial render
  updateRows();

  // Return cleanup function
  return () => {
    for (const component of components) {
      component.destroy();
    }
  };
}

/**
 * Pad a line to exact width.
 */
function padLine(text: string, width: number): string {
  if (text.length >= width) {
    return text.slice(0, width);
  }
  return text + " ".repeat(width - text.length);
}

/**
 * Format a single thread row with status icon, name, pending count, and time.
 */
function formatThreadRow(
  item: ThreadListItem,
  isSelected: boolean,
  isFocused: boolean,
  maxWidth: number
): string {
  const icon = STATUS_ICONS[item.status] || "?";
  const colorFn = STATUS_COLORS[item.status] || ((t: string) => t);

  // Build the row content
  const pendingStr = item.pendingStepsCount > 0
    ? `${item.pendingStepsCount} pending`
    : (item.status === "completed" ? "done" : "");
  const timeStr = item.lastUpdatedRelative;

  // Calculate available space for name
  // Format: " ● name          3 pending - 2h ago "
  const fixedParts = 4 + pendingStr.length + 3 + timeStr.length + 1; // icon + spaces + " - " + padding
  const nameWidth = Math.max(10, maxWidth - fixedParts);
  const truncatedName = item.name.length > nameWidth
    ? item.name.slice(0, nameWidth - 1) + "…"
    : item.name.padEnd(nameWidth);

  // Build the line
  let line = ` ${colorFn(icon)} ${truncatedName}`;
  if (pendingStr) {
    line += `  ${crayon.lightBlack(pendingStr)}`;
  }
  line += ` ${crayon.lightBlack("- " + timeStr)} `;

  // Pad or truncate to exact width
  if (line.length < maxWidth) {
    line = line + " ".repeat(maxWidth - line.length);
  }

  // Apply selection highlighting
  if (isSelected) {
    if (isFocused) {
      // Bright highlight when focused
      return crayon.bgWhite.black(line);
    } else {
      // Dim highlight when not focused
      return crayon.bgLightBlack(line);
    }
  }

  return line;
}
