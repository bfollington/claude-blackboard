/**
 * Drone list panel component.
 * Displays drones with status icons, iteration counts, and session status.
 * Supports keyboard navigation with j/k or arrow keys.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Signal } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState, DroneListItem } from "../state.ts";

export interface DroneListOptions {
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
 * Create the drone list panel.
 * Returns cleanup function to destroy components.
 */
export function createDroneList(options: DroneListOptions): () => void {
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
  const header = new Text({
    parent: tui,
    text: " DRONES ",
    theme: { base: crayon.bgBlack.white.bold },
    rectangle: {
      column: rectangle.column,
      row: rectangle.row,
    },
    zIndex: 2,
  });
  components.push(header);

  // Drone rows - create row components
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

  // Update row content when drone list or selection changes
  const updateRows = () => {
    const items = state.droneListItems.value;
    const selectedIndex = state.selectedDroneIndex.value;

    for (let i = 0; i < maxVisibleRows; i++) {
      const row = rows[i];

      if (items.length === 0 && i < 2) {
        // Empty state messages
        if (i === 0) {
          row.text.value = padLine(" No drones yet", rectangle.width);
        } else {
          row.text.value = padLine(" Press 'n' to create", rectangle.width);
        }
      } else if (i < items.length) {
        const item = items[i];
        const isSelected = i === selectedIndex;
        row.text.value = formatDroneRow(item, isSelected, rectangle.width);
      } else {
        row.text.value = " ".repeat(rectangle.width);
      }
    }
  };

  // Subscribe to state changes
  state.droneListItems.subscribe(updateRows);
  state.selectedDroneIndex.subscribe(updateRows);

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
 * Format a single drone row with status icon, name, and iteration count.
 * Format: ">* drone-name         [3/50]"
 * Icons: * = running session, space = active (no session), o = paused, . = archived
 */
function formatDroneRow(
  item: DroneListItem,
  isSelected: boolean,
  maxWidth: number
): string {
  const icon = item.statusIcon;

  // Use > or space to indicate selection
  const selectionIndicator = isSelected ? ">" : " ";

  // Build iteration indicator if running
  let iterationStr = "";
  if (item.currentSession && item.currentSession.status === 'running') {
    iterationStr = `[${item.currentSession.iteration}/${item.max_iterations}]`;
  }

  // Calculate available space for name
  const fixedParts = 3 + (iterationStr ? iterationStr.length + 1 : 0);
  const nameWidth = Math.max(10, maxWidth - fixedParts);
  const truncatedName = item.name.length > nameWidth
    ? item.name.slice(0, nameWidth - 1) + "~"
    : item.name.padEnd(nameWidth);

  // Build plain text line: ">* name [3/50]"
  let line = `${selectionIndicator}${icon} ${truncatedName}`;
  if (iterationStr) {
    line += ` ${iterationStr}`;
  }

  return padLine(line, maxWidth);
}
