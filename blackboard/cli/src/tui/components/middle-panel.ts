/**
 * Middle panel component showing plan, steps, and tasks for selected thread.
 * Part of the 3-column layout for the Threads tab.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Signal } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState } from "../state.ts";
import type { PlanStep } from "../../types/schema.ts";
import type { ClaudeTask } from "../../utils/tasks.ts";

export interface MiddlePanelOptions {
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
 * Create the middle panel with plan/steps/tasks sections.
 * Returns cleanup function to destroy components.
 */
export function createMiddlePanel(options: MiddlePanelOptions): () => void {
  const { tui, state, rectangle } = options;
  const components: (Text | Box)[] = [];

  // Calculate section heights: PLAN 25%, STEPS 35%, TASKS 40%
  const planHeight = Math.max(6, Math.floor(rectangle.height * 0.25));
  const stepsHeight = Math.floor(rectangle.height * 0.35);
  const tasksHeight = rectangle.height - planHeight - stepsHeight;

  // Section starting rows
  const planRow = rectangle.row;
  const stepsRow = planRow + planHeight;
  const tasksRow = stepsRow + stepsHeight;

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
  // TASKS SECTION (Claude Code tasks from filesystem)
  // =========================================================================
  const tasksPanel = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: {
      column: rectangle.column,
      row: tasksRow,
      width: rectangle.width,
      height: tasksHeight,
    },
    zIndex: 1,
  });
  components.push(tasksPanel);

  // Tasks header
  const tasksHeaderText = new Signal<string>(" TASKS ");
  const tasksHeader = new Text({
    parent: tui,
    text: tasksHeaderText,
    theme: { base: crayon.bgBlack.white.bold },
    rectangle: { column: rectangle.column, row: tasksRow },
    zIndex: 2,
  });
  components.push(tasksHeader);

  // Tasks content rows
  const tasksRows: { text: Signal<string>; component: Text }[] = [];
  for (let i = 1; i < tasksHeight; i++) {
    const rowText = new Signal<string>("");

    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: tasksRow + i },
      zIndex: 2,
    });
    tasksRows.push({ text: rowText, component: text });
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

  const updateTasksSection = () => {
    const tasks = state.tasks.value;
    const selectedIndex = state.selectedTaskIndex.value;
    const isFocused = state.focusedPane.value === "tasks";

    const countStr = tasks.length > 0 ? ` (${tasks.length})` : "";
    tasksHeaderText.value = isFocused ? `>> TASKS${countStr} <<` : ` TASKS${countStr} `;

    if (tasks.length === 0) {
      if (tasksRows[0]) {
        tasksRows[0].text.value = padLine(" No tasks from Claude Code", rectangle.width);
      }
      if (tasksRows[1]) {
        tasksRows[1].text.value = padLine(" Tasks sync from TaskCreate", rectangle.width);
      }
      for (let i = 2; i < tasksRows.length; i++) {
        tasksRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Render tasks with selection indicator
    for (let i = 0; i < tasksRows.length; i++) {
      if (i < tasks.length) {
        const task = tasks[i];
        const isSelected = i === selectedIndex;
        tasksRows[i].text.value = formatTaskRow(task, isSelected, isFocused, rectangle.width);
      } else {
        tasksRows[i].text.value = " ".repeat(rectangle.width);
      }
    }
  };

  // Subscribe to state changes
  state.selectedThread.subscribe(updatePlanSection);
  state.selectedThread.subscribe(updateStepsSection);
  state.selectedThread.subscribe(updateTasksSection);
  state.selectedPlan.subscribe(updatePlanSection);
  state.focusedPane.subscribe(updatePlanSection);
  state.focusedPane.subscribe(updateStepsSection);
  state.focusedPane.subscribe(updateTasksSection);
  state.steps.subscribe(updateStepsSection);
  state.tasks.subscribe(updateTasksSection);
  state.selectedStepIndex.subscribe(updateStepsSection);
  state.selectedTaskIndex.subscribe(updateTasksSection);
  state.findState.subscribe(updatePlanSection);
  state.findState.subscribe(updateStepsSection);

  // Initial render
  updatePlanSection();
  updateStepsSection();
  updateTasksSection();

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
 * Format a task row with status icon and subject.
 */
function formatTaskRow(
  task: ClaudeTask,
  isSelected: boolean,
  isFocused: boolean,
  width: number
): string {
  const statusIcon = task.status === 'completed' ? '[x]' :
                    task.status === 'in_progress' ? '[>]' : '[ ]';
  const selectionIndicator = isSelected ? (isFocused ? ">" : "*") : " ";

  // Truncate subject to fit
  const maxSubjectLen = width - 10; // selection + icon (3) + # + id + colon + space
  const subject = task.subject.length > maxSubjectLen
    ? task.subject.slice(0, maxSubjectLen - 1) + "~"
    : task.subject;

  const line = `${selectionIndicator}${statusIcon} #${task.id}: ${subject}`;
  return padLine(line, width);
}
