/**
 * Detail panel component showing plan, steps, and breadcrumbs for selected thread.
 * Split into three vertical sections with Tab key navigation between them.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Signal } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState } from "../state.ts";
import type { PlanStep, Breadcrumb } from "../../types/schema.ts";

export interface DetailPanelOptions {
  tui: Tui;
  state: TuiState;
  rectangle: {
    column: number;
    row: number;
    width: number;
    height: number;
  };
}

// Step status icons (ASCII-safe)
const STEP_ICONS: Record<string, string> = {
  pending: "[ ]",
  in_progress: "[>]",
  completed: "[x]",
  failed: "[!]",
  skipped: "[-]",
};

/**
 * Create the detail panel with plan/steps/crumbs sections.
 * Returns cleanup function to destroy components.
 */
export function createDetailPanel(options: DetailPanelOptions): () => void {
  const { tui, state, rectangle } = options;
  const components: (Text | Box)[] = [];

  // Calculate section heights
  const planHeight = Math.max(3, Math.floor(rectangle.height * 0.2));
  const remainingHeight = rectangle.height - planHeight;
  const stepsHeight = Math.floor(remainingHeight * 0.5);
  const crumbsHeight = remainingHeight - stepsHeight;

  // Section starting rows
  const planRow = rectangle.row;
  const stepsRow = planRow + planHeight;
  const crumbsRow = stepsRow + stepsHeight;

  // =========================================================================
  // PLAN SECTION
  // =========================================================================
  const planPanel = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: {
      column: rectangle.column,
      row: planRow,
      width: rectangle.width,
      height: planHeight,
    },
    zIndex: 1,
  });
  components.push(planPanel);

  // Plan header
  const planHeaderText = new Signal<string>(" PLAN ");
  const planHeader = new Text({
    parent: tui,
    text: planHeaderText,
    theme: { base: crayon.bgBlack.white.bold },
    rectangle: { column: rectangle.column, row: planRow },
    zIndex: 2,
  });
  components.push(planHeader);

  // Plan content rows
  const planRows: { text: Signal<string>; component: Text }[] = [];
  for (let i = 1; i < planHeight; i++) {
    const rowText = new Signal<string>("");

    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: planRow + i },
      zIndex: 2,
    });
    planRows.push({ text: rowText, component: text });
    components.push(text);
  }

  // =========================================================================
  // STEPS SECTION
  // =========================================================================
  const stepsPanel = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: {
      column: rectangle.column,
      row: stepsRow,
      width: rectangle.width,
      height: stepsHeight,
    },
    zIndex: 1,
  });
  components.push(stepsPanel);

  // Steps header
  const stepsHeaderText = new Signal<string>(" STEPS ");
  const stepsHeader = new Text({
    parent: tui,
    text: stepsHeaderText,
    theme: { base: crayon.bgBlack.white.bold },
    rectangle: { column: rectangle.column, row: stepsRow },
    zIndex: 2,
  });
  components.push(stepsHeader);

  // Steps content rows
  const stepsRows: { text: Signal<string>; component: Text }[] = [];
  for (let i = 1; i < stepsHeight; i++) {
    const rowText = new Signal<string>("");

    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: stepsRow + i },
      zIndex: 2,
    });
    stepsRows.push({ text: rowText, component: text });
    components.push(text);
  }

  // =========================================================================
  // CRUMBS SECTION
  // =========================================================================
  const crumbsPanel = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: {
      column: rectangle.column,
      row: crumbsRow,
      width: rectangle.width,
      height: crumbsHeight,
    },
    zIndex: 1,
  });
  components.push(crumbsPanel);

  // Crumbs header
  const crumbsHeaderText = new Signal<string>(" CRUMBS ");
  const crumbsHeader = new Text({
    parent: tui,
    text: crumbsHeaderText,
    theme: { base: crayon.bgBlack.white.bold },
    rectangle: { column: rectangle.column, row: crumbsRow },
    zIndex: 2,
  });
  components.push(crumbsHeader);

  // Crumbs content rows
  const crumbsRows: { text: Signal<string>; component: Text }[] = [];
  for (let i = 1; i < crumbsHeight; i++) {
    const rowText = new Signal<string>("");

    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: crumbsRow + i },
      zIndex: 2,
    });
    crumbsRows.push({ text: rowText, component: text });
    components.push(text);
  }

  // =========================================================================
  // UPDATE FUNCTIONS
  // =========================================================================

  const updatePlanSection = () => {
    const thread = state.selectedThread.value;
    const isFocused = state.focusedPane.value === "plan";

    // Update header to show focus state
    planHeaderText.value = isFocused ? ">> PLAN <<" : " PLAN ";

    if (!thread) {
      if (planRows[0]) planRows[0].text.value = padLine(" Select a thread to view its plan", rectangle.width);
      for (let i = 1; i < planRows.length; i++) {
        planRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    if (!thread.current_plan_id) {
      if (planRows[0]) planRows[0].text.value = padLine(" No plan for this thread", rectangle.width);
      for (let i = 1; i < planRows.length; i++) {
        planRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Show plan hint
    if (planRows[0]) planRows[0].text.value = padLine(" Plan available - press 'e' to edit", rectangle.width);
    for (let i = 1; i < planRows.length; i++) {
      planRows[i].text.value = " ".repeat(rectangle.width);
    }
  };

  const updateStepsSection = () => {
    const steps = state.steps.value;
    const selectedIndex = state.selectedStepIndex.value;
    const isFocused = state.focusedPane.value === "steps";
    const findState = state.findState.value;

    const countStr = steps.length > 0 ? ` (${steps.length})` : "";
    stepsHeaderText.value = isFocused ? `>> STEPS${countStr} <<` : ` STEPS${countStr} `;

    if (steps.length === 0) {
      if (stepsRows[0]) {
        stepsRows[0].text.value = padLine(" No steps defined", rectangle.width);
      }
      if (stepsRows[1]) {
        stepsRows[1].text.value = padLine(" Steps sync from TodoWrite", rectangle.width);
      }
      for (let i = 2; i < stepsRows.length; i++) {
        stepsRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Render steps with selection indicator
    for (let i = 0; i < stepsRows.length; i++) {
      if (i < steps.length) {
        const step = steps[i];
        const isSelected = i === selectedIndex;

        // Check if this line has the current match
        const currentMatch = findState.isActive &&
          findState.currentMatchIndex >= 0 &&
          findState.matches[findState.currentMatchIndex]?.lineIndex === i &&
          state.focusedPane.value === "steps";

        stepsRows[i].text.value = formatStepRow(
          step,
          isSelected,
          isFocused,
          rectangle.width,
          findState.query,
          currentMatch
        );
      } else {
        stepsRows[i].text.value = " ".repeat(rectangle.width);
      }
    }
  };

  const updateCrumbsSection = () => {
    const crumbs = state.breadcrumbs.value;
    const selectedIndex = state.selectedCrumbIndex.value;
    const isFocused = state.focusedPane.value === "crumbs";
    const findState = state.findState.value;

    const countStr = crumbs.length > 0 ? ` (${crumbs.length})` : "";
    crumbsHeaderText.value = isFocused ? `>> CRUMBS${countStr} <<` : ` CRUMBS${countStr} `;

    if (crumbs.length === 0) {
      if (crumbsRows[0]) {
        crumbsRows[0].text.value = padLine(" No breadcrumbs recorded", rectangle.width);
      }
      if (crumbsRows[1]) {
        crumbsRows[1].text.value = padLine(" Use /crumb to record progress", rectangle.width);
      }
      for (let i = 2; i < crumbsRows.length; i++) {
        crumbsRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Render crumbs (2 lines per crumb: header + summary)
    let rowIndex = 0;
    for (let i = 0; i < crumbs.length && rowIndex < crumbsRows.length; i++) {
      const crumb = crumbs[i];
      const isSelected = i === selectedIndex;

      // Check if this line has the current match
      const currentMatch = findState.isActive &&
        findState.currentMatchIndex >= 0 &&
        findState.matches[findState.currentMatchIndex]?.lineIndex === i &&
        state.focusedPane.value === "crumbs";

      // Header line with selection indicator
      crumbsRows[rowIndex].text.value = formatCrumbHeader(
        crumb,
        isSelected,
        isFocused,
        rectangle.width,
        findState.query,
        currentMatch
      );
      rowIndex++;

      // Summary line
      if (rowIndex < crumbsRows.length) {
        crumbsRows[rowIndex].text.value = formatCrumbSummary(
          crumb,
          rectangle.width,
          findState.query,
          currentMatch
        );
        rowIndex++;
      }
    }

    // Clear remaining rows
    for (let i = rowIndex; i < crumbsRows.length; i++) {
      crumbsRows[i].text.value = " ".repeat(rectangle.width);
    }
  };

  // Subscribe to state changes
  state.selectedThread.subscribe(updatePlanSection);
  state.selectedThread.subscribe(updateStepsSection);
  state.selectedThread.subscribe(updateCrumbsSection);
  state.focusedPane.subscribe(updatePlanSection);
  state.focusedPane.subscribe(updateStepsSection);
  state.focusedPane.subscribe(updateCrumbsSection);
  state.steps.subscribe(updateStepsSection);
  state.breadcrumbs.subscribe(updateCrumbsSection);
  state.selectedStepIndex.subscribe(updateStepsSection);
  state.selectedCrumbIndex.subscribe(updateCrumbsSection);
  state.findState.subscribe(updatePlanSection);
  state.findState.subscribe(updateStepsSection);
  state.findState.subscribe(updateCrumbsSection);

  // Initial render
  updatePlanSection();
  updateStepsSection();
  updateCrumbsSection();

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
 * Highlight matches in text using reverse video.
 */
function highlightMatches(
  text: string,
  query: string,
  isCurrent: boolean
): string {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: string[] = [];
  let lastIndex = 0;

  let matchIndex = lowerText.indexOf(lowerQuery);
  while (matchIndex !== -1) {
    // Add text before match
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }

    // Add highlighted match
    const matchedText = text.slice(matchIndex, matchIndex + query.length);
    if (isCurrent) {
      // Current match: yellow background
      parts.push(crayon.bgYellow.black(matchedText));
    } else {
      // Other matches: use bold white on dark background
      parts.push(crayon.bold.white(matchedText));
    }

    lastIndex = matchIndex + query.length;
    matchIndex = lowerText.indexOf(lowerQuery, lastIndex);
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.join("");
}

/**
 * Format a step row with icon and description (with optional highlighting).
 */
function formatStepRow(
  step: PlanStep,
  isSelected: boolean,
  isFocused: boolean,
  width: number,
  query: string = "",
  isCurrent: boolean = false
): string {
  const icon = STEP_ICONS[step.status] || "[?]";
  const selectionIndicator = isSelected ? (isFocused ? ">" : "*") : " ";

  // Truncate description to fit
  const maxDescLen = width - 7; // selection + icon (3) + spaces (3)
  let desc = step.description.length > maxDescLen
    ? step.description.slice(0, maxDescLen - 1) + "~"
    : step.description;

  // Apply highlighting if query exists
  if (query) {
    desc = highlightMatches(desc, query, isCurrent);
  }

  const line = `${selectionIndicator}${icon} ${desc}`;
  return padLine(line, width);
}

/**
 * Format crumb header line (with optional highlighting).
 */
function formatCrumbHeader(
  crumb: Breadcrumb,
  isSelected: boolean,
  isFocused: boolean,
  width: number,
  query: string = "",
  isCurrent: boolean = false
): string {
  const shortId = crumb.id.slice(0, 7);
  const time = relativeTime(crumb.created_at);
  const agent = crumb.agent_type || "unknown";
  const selectionIndicator = isSelected ? (isFocused ? ">" : "*") : " ";

  let line = `${selectionIndicator}${shortId} ${time}  ${agent}`;

  // Apply highlighting if query exists (note: unlikely to match in header)
  if (query) {
    line = highlightMatches(line, query, isCurrent);
  }

  return padLine(line, width);
}

/**
 * Format crumb summary line (with optional highlighting).
 */
function formatCrumbSummary(
  crumb: Breadcrumb,
  width: number,
  query: string = "",
  isCurrent: boolean = false
): string {
  const maxLen = width - 4;
  let summary = crumb.summary.length > maxLen
    ? crumb.summary.slice(0, maxLen - 1) + "~"
    : crumb.summary;

  // Apply highlighting if query exists
  if (query) {
    summary = highlightMatches(summary, query, isCurrent);
  }

  const line = ` | ${summary}`;
  return padLine(line, width);
}

/**
 * Create relative time string.
 */
function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
}
