/**
 * Next-ups list panel component.
 * Displays next-ups with status icons, truncated titles, and last updated time.
 * Supports keyboard navigation with j/k or arrow keys.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Computed, Signal } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState, NextUpListItem } from "../state.ts";

export interface NextUpsListOptions {
  tui: Tui;
  state: TuiState;
  rectangle: {
    column: number;
    row: number;
    width: number;
    height: number;
  };
}

/**
 * Create the next-ups list panel.
 * Returns cleanup function to destroy components.
 */
export function createNextUpsList(options: NextUpsListOptions): () => void {
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
    return ` NEXT-UPS`;
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

  // Next-up rows - create row components
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

  // Update row content when next-ups list or selection changes
  const updateRows = () => {
    const items = state.nextUpListItems.value;
    const selectedIndex = state.selectedNextUpIndex.value;
    const focusedOnList = state.activeTab.value === "next-ups";

    for (let i = 0; i < maxVisibleRows; i++) {
      const row = rows[i];

      if (items.length === 0 && i < 2) {
        // Empty state messages
        if (i === 0) {
          row.text.value = padLine(" No next-ups found", rectangle.width);
        } else {
          row.text.value = padLine(" Press 'n' to create a next-up", rectangle.width);
        }
      } else if (i < items.length) {
        const item = items[i];
        const isSelected = i === selectedIndex;
        row.text.value = formatNextUpRow(item, isSelected, focusedOnList, rectangle.width);
      } else {
        row.text.value = " ".repeat(rectangle.width);
      }
    }
  };

  // Subscribe to state changes
  state.nextUpListItems.subscribe(updateRows);
  state.selectedNextUpIndex.subscribe(updateRows);
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
 * Format a single next-up row with status icon, title, time, and template indicator.
 * Returns PLAIN TEXT - styling is handled by the component theme.
 * Format: ">* next-up-title-truncated - 5m ago [T]"
 */
function formatNextUpRow(
  item: NextUpListItem,
  isSelected: boolean,
  isFocused: boolean,
  maxWidth: number
): string {
  const icon = item.statusIcon;

  // Use > or space to indicate selection
  const selectionIndicator = isSelected ? (isFocused ? ">" : "*") : " ";

  const timeStr = item.updatedAtRelative;
  const templateIndicator = item.is_template === 1 ? " [T]" : "";

  // Calculate available space for title
  const fixedParts = 5 + 3 + timeStr.length + templateIndicator.length; // " + icon + " " + " - " + timeStr + "[T]"
  const titleWidth = Math.max(10, maxWidth - fixedParts);
  const truncatedTitle = item.titleTruncated.length > titleWidth
    ? item.titleTruncated.slice(0, titleWidth - 1) + "~"
    : item.titleTruncated.padEnd(titleWidth);

  // Build plain text line: ">* title - 5m ago [T]"
  const line = `${selectionIndicator}${icon} ${truncatedTitle} - ${timeStr}${templateIndicator}`;

  return padLine(line, maxWidth);
}
