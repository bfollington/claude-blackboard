/**
 * Bug list panel component.
 * Displays bugs with status icons, truncated titles, and last updated time.
 * Supports keyboard navigation with j/k or arrow keys.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Computed, Signal } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState, BugListItem } from "../state.ts";

export interface BugListOptions {
  tui: Tui;
  state: TuiState;
  rectangle: {
    column: number;
    row: number;
    width: number;
    height: number;
  };
}

// Status icons for different bug states
const STATUS_ICONS: Record<string, string> = {
  open: "!",      // Open
  resolved: "x",  // Resolved
  wontfix: "-",   // Won't fix
};

/**
 * Create the bug list panel.
 * Returns cleanup function to destroy components.
 */
export function createBugList(options: BugListOptions): () => void {
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
    const filter = state.bugFilter.value;
    const filterLabel = filter === "all" ? "ALL" : filter.toUpperCase();
    return ` BUGS [${filterLabel}]`;
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

  // Bug rows - create row components
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

  // Update row content when bug list or selection changes
  const updateRows = () => {
    const items = state.bugListItems.value;
    const selectedIndex = state.selectedBugIndex.value;
    const focusedOnList = state.focusedPane.value === "list";

    for (let i = 0; i < maxVisibleRows; i++) {
      const row = rows[i];

      if (items.length === 0 && i < 2) {
        // Empty state messages
        if (i === 0) {
          row.text.value = padLine(" No bugs found", rectangle.width);
        } else {
          row.text.value = padLine(" File bugs: blackboard bug-report", rectangle.width);
        }
      } else if (i < items.length) {
        const item = items[i];
        const isSelected = i === selectedIndex;
        // Use > prefix to indicate selection since we can't change bg color dynamically
        row.text.value = formatBugRow(item, isSelected, focusedOnList, rectangle.width);
      } else {
        row.text.value = " ".repeat(rectangle.width);
      }
    }
  };

  // Subscribe to state changes
  state.bugListItems.subscribe(updateRows);
  state.selectedBugIndex.subscribe(updateRows);
  state.focusedPane.subscribe(updateRows);
  state.bugFilter.subscribe(updateRows);
  state.activeTab.subscribe(updateRows);

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
 * Format a single bug row with status icon, title, and time.
 * Returns PLAIN TEXT - styling is handled by the component theme.
 * Format: ">! bug-title-truncated - 5m ago"
 */
function formatBugRow(
  item: BugListItem,
  isSelected: boolean,
  isFocused: boolean,
  maxWidth: number
): string {
  const icon = STATUS_ICONS[item.status] || "?";

  // Use > or space to indicate selection
  const selectionIndicator = isSelected ? (isFocused ? ">" : "*") : " ";

  const timeStr = item.createdAtRelative;

  // Calculate available space for title
  const fixedParts = 5 + 3 + timeStr.length; // " + icon + " " + " - " + timeStr
  const titleWidth = Math.max(10, maxWidth - fixedParts);
  const truncatedTitle = item.titleTruncated.length > titleWidth
    ? item.titleTruncated.slice(0, titleWidth - 1) + "~"
    : item.titleTruncated.padEnd(titleWidth);

  // Build plain text line: ">! title - 5m ago"
  const line = `${selectionIndicator}${icon} ${truncatedTitle} - ${timeStr}`;

  return padLine(line, maxWidth);
}
