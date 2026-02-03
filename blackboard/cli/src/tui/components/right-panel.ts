/**
 * Right panel component showing workers, live logs, and breadcrumbs.
 * Part of the 3-column layout for the Threads tab.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Signal } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState } from "../state.ts";
import type { Breadcrumb, WorkerEvent } from "../../types/schema.ts";
import { relativeTime as relativeTimeUtil } from "../../utils/time.ts";

export interface RightPanelOptions {
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
 * Create the right panel with workers/logs/crumbs sections.
 * Returns cleanup function to destroy components.
 */
export function createRightPanel(options: RightPanelOptions): () => void {
  const { tui, state, rectangle } = options;
  const components: (Text | Box)[] = [];

  // Calculate section heights: WORKERS 15%, LOGS 55%, CRUMBS 30%
  const workersHeight = Math.max(4, Math.floor(rectangle.height * 0.15));
  const crumbsHeight = Math.floor(rectangle.height * 0.30);
  const logsHeight = rectangle.height - workersHeight - crumbsHeight;

  // Section starting rows
  const workersRow = rectangle.row;
  const logsRow = workersRow + workersHeight;
  const crumbsRow = logsRow + logsHeight;

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
  // LIVE LOGS SECTION
  // =========================================================================
  const logsPanel = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: {
      column: rectangle.column,
      row: logsRow,
      width: rectangle.width,
      height: logsHeight,
    },
    zIndex: 1,
  });
  components.push(logsPanel);

  // Logs header
  const logsHeaderText = new Signal<string>(" LIVE LOGS ");
  const logsHeader = new Text({
    parent: tui,
    text: logsHeaderText,
    theme: { base: crayon.bgBlack.cyan.bold },
    rectangle: { column: rectangle.column, row: logsRow },
    zIndex: 2,
  });
  components.push(logsHeader);

  // Logs content rows
  const logsRows: { text: Signal<string>; component: Text }[] = [];
  for (let i = 1; i < logsHeight; i++) {
    const rowText = new Signal<string>("");
    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: logsRow + i },
      zIndex: 2,
    });
    logsRows.push({ text: rowText, component: text });
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

  const updateWorkersSection = () => {
    const workers = state.workersForSelectedThread.value;
    const workerError = state.workerError.value;
    const selectedIndex = state.selectedWorkerIndex.value;
    const isFocused = state.focusedPane.value === "workers";

    const countStr = workers.length > 0 ? ` (${workers.length})` : "";
    workersHeaderText.value = isFocused ? `>> WORKERS${countStr} <<` : ` WORKERS${countStr} `;

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
        workersRows[1].text.value = padLine(" Press 'w' to spawn", rectangle.width);
      }
      for (let i = 2; i < workersRows.length; i++) {
        workersRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Show workers with status and selection indicator
    for (let i = 0; i < workersRows.length; i++) {
      if (i < workers.length) {
        const worker = workers[i];
        const isSelected = i === selectedIndex;
        const selectionIndicator = isSelected ? (isFocused ? ">" : "*") : " ";
        const shortId = worker.id.slice(0, 7);
        const iteration = worker.iteration || 0;
        const maxIter = worker.max_iterations || 50;
        const heartbeat = worker.last_heartbeat ? relativeTime(worker.last_heartbeat) : "—";

        // Format: ">abc1234 [5/50] 10s"
        const line = `${selectionIndicator}${shortId} [${iteration}/${maxIter}] ${heartbeat}`;
        workersRows[i].text.value = padLine(line, rectangle.width);
      } else {
        workersRows[i].text.value = " ".repeat(rectangle.width);
      }
    }
  };

  const updateLogsSection = () => {
    const events = state.workerEventsForSelectedThread.value;
    const workers = state.workersForSelectedThread.value;
    const isFocused = state.focusedPane.value === "logs";
    const hasRunningWorkers = workers.some(w => w.status === 'running');

    const countStr = events.length > 0 ? ` (${events.length})` : "";
    const runningIndicator = hasRunningWorkers ? " *" : "";
    logsHeaderText.value = isFocused
      ? `>> LIVE LOGS${countStr}${runningIndicator} <<`
      : ` LIVE LOGS${countStr}${runningIndicator} `;

    if (events.length === 0) {
      if (logsRows[0]) {
        logsRows[0].text.value = padLine(" No events yet", rectangle.width);
      }
      if (logsRows[1]) {
        logsRows[1].text.value = padLine(" Spawn a worker to see activity", rectangle.width);
      }
      for (let i = 2; i < logsRows.length; i++) {
        logsRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Show recent events (most recent first, auto-scrolling)
    const recentEvents = events.slice(0, logsRows.length);

    for (let i = 0; i < logsRows.length; i++) {
      if (i < recentEvents.length) {
        const event = recentEvents[i];
        logsRows[i].text.value = formatEventRow(event, rectangle.width);
      } else {
        logsRows[i].text.value = " ".repeat(rectangle.width);
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
        crumbsRows[1].text.value = padLine(" Use /crumb to record", rectangle.width);
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
  state.selectedThread.subscribe(updateWorkersSection);
  state.selectedThread.subscribe(updateLogsSection);
  state.selectedThread.subscribe(updateCrumbsSection);
  state.focusedPane.subscribe(updateWorkersSection);
  state.focusedPane.subscribe(updateLogsSection);
  state.focusedPane.subscribe(updateCrumbsSection);
  state.workersForSelectedThread.subscribe(updateWorkersSection);
  state.workersForSelectedThread.subscribe(updateLogsSection);
  state.workers.subscribe(updateWorkersSection);
  state.workerError.subscribe(updateWorkersSection);
  state.workerEventsForSelectedThread.subscribe(updateLogsSection);
  state.breadcrumbs.subscribe(updateCrumbsSection);
  state.selectedCrumbIndex.subscribe(updateCrumbsSection);
  state.selectedWorkerIndex.subscribe(updateWorkersSection);
  state.findState.subscribe(updateCrumbsSection);

  // Initial render
  updateWorkersSection();
  updateLogsSection();
  updateCrumbsSection();

  // Set up animation timer for live logs - updates every 2 seconds
  const animationInterval = setInterval(() => {
    const workers = state.workersForSelectedThread.value;
    const hasRunningWorkers = workers.some(w => w.status === 'running');
    if (hasRunningWorkers) {
      updateLogsSection();
    }
  }, 2000);

  // Return cleanup function
  return () => {
    clearInterval(animationInterval);
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
 * Format a worker event row with timestamp, type, and details.
 */
function formatEventRow(event: WorkerEvent, width: number): string {
  const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  let eventDesc = "";
  if (event.event_type === 'tool_call') {
    const toolName = event.tool_name || "unknown";
    if (event.file_path) {
      eventDesc = `[${toolName}] ${event.file_path}`;
    } else if (event.tool_input) {
      const preview = event.tool_input.slice(0, 30);
      eventDesc = `[${toolName}] ${preview}${event.tool_input.length > 30 ? "..." : ""}`;
    } else {
      eventDesc = `[${toolName}]`;
    }
  } else if (event.event_type === 'text') {
    const preview = event.tool_output_preview?.slice(0, 40) || "...";
    eventDesc = `[Text] ${preview}`;
  } else if (event.event_type === 'error') {
    const preview = event.tool_output_preview?.slice(0, 40) || "error";
    eventDesc = `[ERROR] ${preview}`;
  } else {
    eventDesc = `[${event.event_type}]`;
  }

  const line = ` ${time} ${eventDesc}`;
  return padLine(line, width);
}

/**
 * Create relative time string (short format for TUI).
 */
function relativeTime(dateStr: string): string {
  const result = relativeTimeUtil(dateStr);
  return result.replace(" ago", "").replace("just now", "now");
}

/**
 * Highlight matches in text using plain text markers.
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
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }

    const matchedText = text.slice(matchIndex, matchIndex + query.length);
    if (isCurrent) {
      parts.push(`<<${matchedText}>>`);
    } else {
      parts.push(`[${matchedText}]`);
    }

    lastIndex = matchIndex + query.length;
    matchIndex = lowerText.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.join("");
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

  if (query) {
    summary = highlightMatches(summary, query, isCurrent);
  }

  const line = ` | ${summary}`;
  return padLine(line, width);
}
