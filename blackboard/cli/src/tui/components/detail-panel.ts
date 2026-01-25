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

// Step status icons
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
  // Plan: ~20% (min 3 rows), Steps: ~40%, Crumbs: ~40%
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
  const planRows: Signal<string>[] = [];
  const planRowComponents: Text[] = [];
  for (let i = 1; i < planHeight; i++) {
    const rowText = new Signal<string>("");
    planRows.push(rowText);
    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: planRow + i },
      zIndex: 2,
    });
    planRowComponents.push(text);
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
  const stepsRows: Signal<string>[] = [];
  const stepsRowComponents: Text[] = [];
  for (let i = 1; i < stepsHeight; i++) {
    const rowText = new Signal<string>("");
    stepsRows.push(rowText);
    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: stepsRow + i },
      zIndex: 2,
    });
    stepsRowComponents.push(text);
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
  const crumbsRows: Signal<string>[] = [];
  const crumbsRowComponents: Text[] = [];
  for (let i = 1; i < crumbsHeight; i++) {
    const rowText = new Signal<string>("");
    crumbsRows.push(rowText);
    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: crumbsRow + i },
      zIndex: 2,
    });
    crumbsRowComponents.push(text);
    components.push(text);
  }

  // =========================================================================
  // UPDATE FUNCTIONS
  // =========================================================================

  const updatePlanSection = () => {
    const thread = state.selectedThread.value;
    const isFocused = state.focusedPane.value === "plan";

    // Update header with focus indicator
    planHeaderText.value = isFocused
      ? crayon.bgWhite.black.bold(" PLAN ")
      : crayon.bgBlack.white.bold(" PLAN ");

    if (!thread) {
      planRows[0].value = padLine(crayon.lightBlack(" Select a thread to view its plan"), rectangle.width);
      for (let i = 1; i < planRows.length; i++) {
        planRows[i].value = " ".repeat(rectangle.width);
      }
      return;
    }

    if (!thread.current_plan_id) {
      planRows[0].value = padLine(crayon.lightBlack(" No plan for this thread"), rectangle.width);
      for (let i = 1; i < planRows.length; i++) {
        planRows[i].value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Show plan hint
    planRows[0].value = padLine(crayon.cyan(" Plan available"), rectangle.width);
    planRows[1].value = padLine(crayon.lightBlack(" Press 'e' to edit in $EDITOR"), rectangle.width);
    for (let i = 2; i < planRows.length; i++) {
      planRows[i].value = " ".repeat(rectangle.width);
    }
  };

  const updateStepsSection = () => {
    const steps = state.steps.value;
    const selectedIndex = state.selectedStepIndex.value;
    const isFocused = state.focusedPane.value === "steps";

    // Update header with focus indicator and count
    const countStr = steps.length > 0 ? ` (${steps.length})` : "";
    stepsHeaderText.value = isFocused
      ? crayon.bgWhite.black.bold(` STEPS${countStr} `)
      : crayon.bgBlack.white.bold(` STEPS${countStr} `);

    if (steps.length === 0) {
      stepsRows[0].value = padLine(crayon.lightBlack(" No steps defined"), rectangle.width);
      stepsRows[1].value = padLine(crayon.lightBlack(" Steps sync from TodoWrite"), rectangle.width);
      for (let i = 2; i < stepsRows.length; i++) {
        stepsRows[i].value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Render steps
    for (let i = 0; i < stepsRows.length; i++) {
      if (i < steps.length) {
        const step = steps[i];
        const isSelected = i === selectedIndex;
        stepsRows[i].value = formatStepRow(step, isSelected, isFocused, rectangle.width);
      } else {
        stepsRows[i].value = " ".repeat(rectangle.width);
      }
    }
  };

  const updateCrumbsSection = () => {
    const crumbs = state.breadcrumbs.value;
    const selectedIndex = state.selectedCrumbIndex.value;
    const isFocused = state.focusedPane.value === "crumbs";

    // Update header with focus indicator
    const countStr = crumbs.length > 0 ? ` (${crumbs.length})` : "";
    crumbsHeaderText.value = isFocused
      ? crayon.bgWhite.black.bold(` CRUMBS${countStr} `)
      : crayon.bgBlack.white.bold(` CRUMBS${countStr} `);

    if (crumbs.length === 0) {
      crumbsRows[0].value = padLine(crayon.lightBlack(" No breadcrumbs recorded"), rectangle.width);
      crumbsRows[1].value = padLine(crayon.lightBlack(" Use /crumb to record progress"), rectangle.width);
      for (let i = 2; i < crumbsRows.length; i++) {
        crumbsRows[i].value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Render crumbs (git-log style)
    let rowIndex = 0;
    for (let i = 0; i < crumbs.length && rowIndex < crumbsRows.length; i++) {
      const crumb = crumbs[i];
      const isSelected = i === selectedIndex;

      // First line: ID, time, agent
      const line1 = formatCrumbHeader(crumb, isSelected, isFocused, rectangle.width);
      crumbsRows[rowIndex].value = line1;
      rowIndex++;

      // Second line: summary (if room)
      if (rowIndex < crumbsRows.length) {
        const line2 = formatCrumbSummary(crumb, isSelected, isFocused, rectangle.width);
        crumbsRows[rowIndex].value = line2;
        rowIndex++;
      }
    }

    // Clear remaining rows
    for (let i = rowIndex; i < crumbsRows.length; i++) {
      crumbsRows[i].value = " ".repeat(rectangle.width);
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
 * Format a step row with icon and description.
 */
function formatStepRow(
  step: PlanStep,
  isSelected: boolean,
  isFocused: boolean,
  width: number
): string {
  const icon = STEP_ICONS[step.status] || "[?]";
  const iconColored = step.status === "completed"
    ? crayon.green(icon)
    : step.status === "in_progress"
    ? crayon.yellow(icon)
    : step.status === "failed"
    ? crayon.red(icon)
    : crayon.white(icon);

  // Truncate description to fit
  const maxDescLen = width - 6; // icon (3) + spaces (3)
  const desc = step.description.length > maxDescLen
    ? step.description.slice(0, maxDescLen - 1) + "…"
    : step.description;

  let line = ` ${iconColored} ${desc}`;
  line = padLine(line, width);

  if (isSelected) {
    if (isFocused) {
      return crayon.bgWhite.black(line);
    }
    return crayon.bgLightBlack(line);
  }
  return line;
}

/**
 * Format crumb header line (ID, time, agent).
 */
function formatCrumbHeader(
  crumb: Breadcrumb,
  isSelected: boolean,
  isFocused: boolean,
  width: number
): string {
  const shortId = crumb.id.slice(0, 7);
  const time = relativeTime(crumb.created_at);
  const agent = crumb.agent_type || "unknown";

  let line = ` ${crayon.yellow(shortId)} ${crayon.lightBlack(time)}  ${crayon.cyan(agent)}`;
  line = padLine(line, width);

  if (isSelected) {
    if (isFocused) {
      return crayon.bgWhite.black(line);
    }
    return crayon.bgLightBlack(line);
  }
  return line;
}

/**
 * Format crumb summary line.
 */
function formatCrumbSummary(
  crumb: Breadcrumb,
  isSelected: boolean,
  isFocused: boolean,
  width: number
): string {
  const maxLen = width - 4;
  const summary = crumb.summary.length > maxLen
    ? crumb.summary.slice(0, maxLen - 1) + "…"
    : crumb.summary;

  let line = ` │ ${summary}`;
  line = padLine(line, width);

  if (isSelected) {
    if (isFocused) {
      return crayon.bgWhite.black(line);
    }
    return crayon.bgLightBlack(line);
  }
  return crayon.lightBlack(line);
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
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
