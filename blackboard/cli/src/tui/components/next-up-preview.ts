/**
 * Next-up content preview panel component.
 * Shows the markdown content of the selected next-up.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Signal } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState } from "../state.ts";

export interface NextUpPreviewOptions {
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
 * Create the next-up content preview panel.
 * Returns cleanup function to destroy components.
 */
export function createNextUpPreview(options: NextUpPreviewOptions): () => void {
  const { tui, state, rectangle } = options;
  const components: (Text | Box)[] = [];

  // Background panel
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
  const headerText = new Signal<string>(" CONTENT ");
  const header = new Text({
    parent: tui,
    text: headerText,
    theme: { base: crayon.bgBlack.white.bold },
    rectangle: { column: rectangle.column, row: rectangle.row },
    zIndex: 2,
  });
  components.push(header);

  // Content rows (one Text component per line)
  const contentRows: { text: Signal<string>; component: Text }[] = [];
  const contentHeight = rectangle.height - 1; // Subtract header row

  for (let i = 0; i < contentHeight; i++) {
    const rowText = new Signal<string>("");
    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: rectangle.row + 1 + i },
      zIndex: 2,
    });
    contentRows.push({ text: rowText, component: text });
    components.push(text);
  }

  // Update function
  const updateContent = () => {
    const nextUp = state.selectedNextUp.value;

    if (!nextUp) {
      headerText.value = " CONTENT ";
      if (contentRows[0]) {
        contentRows[0].text.value = padLine(" Select a next-up to preview", rectangle.width);
      }
      for (let i = 1; i < contentRows.length; i++) {
        contentRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Update header with title
    const titlePreview = nextUp.title.length > rectangle.width - 12
      ? nextUp.title.slice(0, rectangle.width - 15) + "..."
      : nextUp.title;
    headerText.value = ` ${titlePreview} `;

    const content = nextUp.content || "";

    if (!content.trim()) {
      if (contentRows[0]) {
        contentRows[0].text.value = padLine(" (empty)", rectangle.width);
      }
      if (contentRows[1]) {
        contentRows[1].text.value = padLine(" Press 'o' to add content", rectangle.width);
      }
      for (let i = 2; i < contentRows.length; i++) {
        contentRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Split content into lines and render
    const lines = content.split("\n");

    for (let i = 0; i < contentRows.length; i++) {
      if (i < lines.length) {
        // Prefix with space for padding, handle line content
        const line = " " + lines[i];
        contentRows[i].text.value = padLine(line, rectangle.width);
      } else {
        contentRows[i].text.value = " ".repeat(rectangle.width);
      }
    }
  };

  // Subscribe to state changes
  state.selectedNextUp.subscribe(updateContent);
  state.nextUps.subscribe(updateContent);

  // Initial render
  updateContent();

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
