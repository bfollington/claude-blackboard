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
  active: "*",    // Active
  paused: "o",    // Paused
  completed: "x", // Completed
  archived: ".",  // Archived
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

  // Thread rows - create row components
  const maxVisibleRows = rectangle.height - 2;

  const rows: { text: Signal<string>; component: Text }[] = [];

  for (let i = 0; i < maxVisibleRows; i++) {
    const rowText = new Signal<string>("");

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

    rows.push({ text: rowText, component: text });
    components.push(text);
  }

  // Update row content when thread list or selection changes
  const updateRows = () => {
    const items = state.threadListItems.value;
    const selectedIndex = state.selectedThreadIndex.value;
    const focusedOnList = state.focusedPane.value === "list";

    for (let i = 0; i < maxVisibleRows; i++) {
      const row = rows[i];

      if (items.length === 0 && i < 2) {
        // Empty state messages
        const filter = state.threadFilter.value;
        if (i === 0) {
          row.text.value = padLine(filter === "all" ? " No threads yet" : ` No ${filter} threads`, rectangle.width);
        } else {
          row.text.value = padLine(" Create: blackboard thread new <name>", rectangle.width);
        }
      } else if (i < items.length) {
        const item = items[i];
        const isSelected = i === selectedIndex;
        // Use > prefix to indicate selection since we can't change bg color dynamically
        row.text.value = formatThreadRow(item, isSelected, focusedOnList, rectangle.width);
      } else {
        row.text.value = " ".repeat(rectangle.width);
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
 * Get the current spinner frame based on time.
 * Cycles through: | / - \
 * Updates every 150ms (about 6-7 FPS for smooth but not distracting animation)
 */
function getSpinnerFrame(): string {
  const frames = ["|", "/", "-", "\\"];
  const frameIndex = Math.floor(Date.now() / 150) % frames.length;
  return frames[frameIndex];
}

/**
 * Format a single thread row with status icon, name, worker count, pending count, and time.
 * Returns PLAIN TEXT - styling is handled by the component theme.
 * Format: ">* thread-name [2w |] (3) - 5m ago" (with animated spinner when workers active)
 */
function formatThreadRow(
  item: ThreadListItem,
  isSelected: boolean,
  isFocused: boolean,
  maxWidth: number
): string {
  const icon = STATUS_ICONS[item.status] || "?";

  // Use > or space to indicate selection
  const selectionIndicator = isSelected ? (isFocused ? ">" : "*") : " ";

  // Build worker indicator with animated spinner if workers are active
  let workerStr = "";
  if (item.workerCount > 0) {
    const spinner = getSpinnerFrame();
    workerStr = `[${item.workerCount}w ${spinner}]`;
  }

  // Build pending/status indicator
  const pendingStr = item.pendingStepsCount > 0
    ? `(${item.pendingStepsCount})`
    : (item.status === "completed" ? "(done)" : "");
  const timeStr = item.lastUpdatedRelative;

  // Calculate available space for name (account for worker indicator)
  const fixedParts = 5 + (workerStr ? workerStr.length + 1 : 0) + (pendingStr ? pendingStr.length + 1 : 0) + 3 + timeStr.length;
  const nameWidth = Math.max(10, maxWidth - fixedParts);
  const truncatedName = item.name.length > nameWidth
    ? item.name.slice(0, nameWidth - 1) + "~"
    : item.name.padEnd(nameWidth);

  // Build plain text line: ">* name [2w |] (3) - 5m"
  let line = `${selectionIndicator}${icon} ${truncatedName}`;
  if (workerStr) {
    line += ` ${workerStr}`;
  }
  if (pendingStr) {
    line += ` ${pendingStr}`;
  }
  line += ` - ${timeStr}`;

  return padLine(line, maxWidth);
}
