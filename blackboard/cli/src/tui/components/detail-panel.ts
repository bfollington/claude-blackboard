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
import { relativeTime as relativeTimeUtil } from "../../utils/time.ts";

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
  const planHeight = 8; // Header + 7 content rows for plan preview
  const workersHeight = 4; // Header + 3 worker rows
  const remainingHeight = rectangle.height - planHeight - workersHeight;
  const stepsHeight = Math.floor(remainingHeight * 0.45);
  const crumbsHeight = remainingHeight - stepsHeight;

  // Section starting rows
  const planRow = rectangle.row;
  const workersRow = planRow + planHeight;
  const stepsRow = workersRow + workersHeight;
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
  // WORKERS SECTION
  // =========================================================================
  const workersPanel = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: {
      column: rectangle.column,
      row: workersRow,
      width: rectangle.width,
      height: workersHeight,
    },
    zIndex: 1,
  });
  components.push(workersPanel);

  // Workers header
  const workersHeaderText = new Signal<string>(" WORKERS ");
  const workersHeader = new Text({
    parent: tui,
    text: workersHeaderText,
    theme: { base: crayon.bgBlack.white.bold },
    rectangle: { column: rectangle.column, row: workersRow },
    zIndex: 2,
  });
  components.push(workersHeader);

  // Workers content rows
  const workersRows: { text: Signal<string>; component: Text }[] = [];
  for (let i = 1; i < workersHeight; i++) {
    const rowText = new Signal<string>("");
    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: workersRow + i },
      zIndex: 2,
    });
    workersRows.push({ text: rowText, component: text });
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
    const plan = state.selectedPlan.value;
    const isFocused = state.focusedPane.value === "plan";

    planHeaderText.value = isFocused
      ? `>> PLAN <<`
      : ` PLAN `;

    if (!thread) {
      if (planRows[0]) planRows[0].text.value = padLine(" Select a thread to view its plan", rectangle.width);
      for (let i = 1; i < planRows.length; i++) {
        planRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    if (!thread.current_plan_id || !plan) {
      if (planRows[0]) planRows[0].text.value = padLine(" No plan - press 'o' to create", rectangle.width);
      for (let i = 1; i < planRows.length; i++) {
        planRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Show plan content preview
    const markdown = plan.plan_markdown || "";
    if (!markdown.trim()) {
      if (planRows[0]) planRows[0].text.value = padLine(" (empty plan) - press 'o' to edit", rectangle.width);
      for (let i = 1; i < planRows.length; i++) {
        planRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Split content into lines and render
    const lines = markdown.split("\n");
    for (let i = 0; i < planRows.length; i++) {
      if (i < lines.length) {
        const line = " " + lines[i];
        planRows[i].text.value = padLine(line, rectangle.width);
      } else {
        planRows[i].text.value = " ".repeat(rectangle.width);
      }
    }
  };

  const updateWorkersSection = () => {
    const workers = state.workersForSelectedThread.value;
    const workerError = state.workerError.value;

    const countStr = workers.length > 0 ? ` (${workers.length})` : "";
    workersHeaderText.value = ` WORKERS${countStr} `;

    // Show error if present
    if (workerError) {
      if (workersRows[0]) {
        workersRows[0].text.value = padLine(` ERROR: ${workerError}`, rectangle.width);
      }
      for (let i = 1; i < workersRows.length; i++) {
        workersRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    if (workers.length === 0) {
      if (workersRows[0]) {
        workersRows[0].text.value = padLine(" No active workers", rectangle.width);
      }
      if (workersRows[1]) {
        workersRows[1].text.value = padLine(" Press 'w' to spawn a worker", rectangle.width);
      }
      for (let i = 2; i < workersRows.length; i++) {
        workersRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Show workers with status
    for (let i = 0; i < workersRows.length; i++) {
      if (i < workers.length) {
        const worker = workers[i];
        const shortId = worker.id.slice(0, 7);
        const status = worker.status;
        const iteration = worker.iteration || 0;
        const maxIter = worker.max_iterations || 50;
        const heartbeat = worker.last_heartbeat ? relativeTime(worker.last_heartbeat) : "—";

        // Format: " abc1234 running [5/50] heartbeat: 10s ago"
        const line = ` ${shortId} ${status} [${iteration}/${maxIter}] heartbeat: ${heartbeat}`;
        workersRows[i].text.value = padLine(line, rectangle.width);
      } else if (i === workers.length && workers.length > 0 && i < workersRows.length) {
        // Show hint about viewing logs
        workersRows[i].text.value = padLine(" Tip: 'blackboard logs <id>' to view worker output", rectangle.width);
      } else {
        workersRows[i].text.value = " ".repeat(rectangle.width);
      }
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
  state.selectedThread.subscribe(updateWorkersSection);
  state.selectedThread.subscribe(updateStepsSection);
  state.selectedThread.subscribe(updateCrumbsSection);
  state.selectedPlan.subscribe(updatePlanSection);
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
  state.workersForSelectedThread.subscribe(updateWorkersSection);
  state.workers.subscribe(updateWorkersSection);
  state.workerError.subscribe(updateWorkersSection);

  // Initial render
  updatePlanSection();
  updateWorkersSection();
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
 * Highlight matches in text using plain text markers.
 * Current match: <<match>>
 * Other matches: [match]
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

    // Add highlighted match with plain text markers
    const matchedText = text.slice(matchIndex, matchIndex + query.length);
    if (isCurrent) {
      // Current match: <<match>>
      parts.push(`<<${matchedText}>>`);
    } else {
      // Other matches: [match]
      parts.push(`[${matchedText}]`);
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
 * Delegates to the shared utility function, but uses shorter format for TUI.
 */
function relativeTime(dateStr: string): string {
  const result = relativeTimeUtil(dateStr);
  // Convert "just now" to "now" and "5m ago" to "5m" for compact TUI display
  return result.replace(" ago", "").replace("just now", "now");
}
