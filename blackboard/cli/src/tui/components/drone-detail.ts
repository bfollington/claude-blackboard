/**
 * Drone detail panel component showing prompt, config, current session, live activity, and recent sessions.
 */

import { Text, Box } from "https://deno.land/x/tui@2.1.11/src/components/mod.ts";
import { Signal } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import type { Tui } from "https://deno.land/x/tui@2.1.11/mod.ts";
import type { TuiState } from "../state.ts";
import type { WorkerEvent } from "../../types/schema.ts";
import { relativeTime as relativeTimeUtil } from "../../utils/time.ts";

export interface DroneDetailOptions {
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
 * Create the drone detail panel with multiple sections.
 * Returns cleanup function to destroy components.
 */
export function createDroneDetail(options: DroneDetailOptions): () => void {
  const { tui, state, rectangle } = options;
  const components: (Text | Box)[] = [];

  // Calculate section heights
  const promptHeight = 6; // Header + 5 content rows
  const configHeight = 3; // Header + 2 content rows
  const currentSessionHeight = 4; // Header + 3 content rows
  const remainingHeight = rectangle.height - promptHeight - configHeight - currentSessionHeight;
  const liveActivityHeight = Math.floor(remainingHeight * 0.6);
  const recentSessionsHeight = remainingHeight - liveActivityHeight;

  // Section starting rows
  const promptRow = rectangle.row;
  const configRow = promptRow + promptHeight;
  const currentSessionRow = configRow + configHeight;
  const liveActivityRow = currentSessionRow + currentSessionHeight;
  const recentSessionsRow = liveActivityRow + liveActivityHeight;

  // =========================================================================
  // PROMPT SECTION
  // =========================================================================
  const promptPanel = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: {
      column: rectangle.column,
      row: promptRow,
      width: rectangle.width,
      height: promptHeight,
    },
    zIndex: 1,
  });
  components.push(promptPanel);

  const promptHeader = new Text({
    parent: tui,
    text: " PROMPT ",
    theme: { base: crayon.bgBlack.white.bold },
    rectangle: { column: rectangle.column, row: promptRow },
    zIndex: 2,
  });
  components.push(promptHeader);

  const promptRows: { text: Signal<string>; component: Text }[] = [];
  for (let i = 1; i < promptHeight; i++) {
    const rowText = new Signal<string>("");
    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: promptRow + i },
      zIndex: 2,
    });
    promptRows.push({ text: rowText, component: text });
    components.push(text);
  }

  // =========================================================================
  // CONFIG SECTION
  // =========================================================================
  const configPanel = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: {
      column: rectangle.column,
      row: configRow,
      width: rectangle.width,
      height: configHeight,
    },
    zIndex: 1,
  });
  components.push(configPanel);

  const configHeader = new Text({
    parent: tui,
    text: " CONFIG ",
    theme: { base: crayon.bgBlack.white.bold },
    rectangle: { column: rectangle.column, row: configRow },
    zIndex: 2,
  });
  components.push(configHeader);

  const configRows: { text: Signal<string>; component: Text }[] = [];
  for (let i = 1; i < configHeight; i++) {
    const rowText = new Signal<string>("");
    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: configRow + i },
      zIndex: 2,
    });
    configRows.push({ text: rowText, component: text });
    components.push(text);
  }

  // =========================================================================
  // CURRENT SESSION SECTION
  // =========================================================================
  const currentSessionPanel = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: {
      column: rectangle.column,
      row: currentSessionRow,
      width: rectangle.width,
      height: currentSessionHeight,
    },
    zIndex: 1,
  });
  components.push(currentSessionPanel);

  const currentSessionHeader = new Text({
    parent: tui,
    text: " CURRENT SESSION ",
    theme: { base: crayon.bgBlack.white.bold },
    rectangle: { column: rectangle.column, row: currentSessionRow },
    zIndex: 2,
  });
  components.push(currentSessionHeader);

  const currentSessionRows: { text: Signal<string>; component: Text }[] = [];
  for (let i = 1; i < currentSessionHeight; i++) {
    const rowText = new Signal<string>("");
    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: currentSessionRow + i },
      zIndex: 2,
    });
    currentSessionRows.push({ text: rowText, component: text });
    components.push(text);
  }

  // =========================================================================
  // LIVE ACTIVITY SECTION
  // =========================================================================
  const liveActivityPanel = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: {
      column: rectangle.column,
      row: liveActivityRow,
      width: rectangle.width,
      height: liveActivityHeight,
    },
    zIndex: 1,
  });
  components.push(liveActivityPanel);

  const liveActivityHeader = new Text({
    parent: tui,
    text: " LIVE ACTIVITY ",
    theme: { base: crayon.bgBlack.cyan.bold },
    rectangle: { column: rectangle.column, row: liveActivityRow },
    zIndex: 2,
  });
  components.push(liveActivityHeader);

  const liveActivityRows: { text: Signal<string>; component: Text }[] = [];
  for (let i = 1; i < liveActivityHeight; i++) {
    const rowText = new Signal<string>("");
    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: liveActivityRow + i },
      zIndex: 2,
    });
    liveActivityRows.push({ text: rowText, component: text });
    components.push(text);
  }

  // =========================================================================
  // RECENT SESSIONS SECTION
  // =========================================================================
  const recentSessionsPanel = new Box({
    parent: tui,
    theme: { base: crayon.bgBlack },
    rectangle: {
      column: rectangle.column,
      row: recentSessionsRow,
      width: rectangle.width,
      height: recentSessionsHeight,
    },
    zIndex: 1,
  });
  components.push(recentSessionsPanel);

  const recentSessionsHeader = new Text({
    parent: tui,
    text: " RECENT SESSIONS ",
    theme: { base: crayon.bgBlack.white.bold },
    rectangle: { column: rectangle.column, row: recentSessionsRow },
    zIndex: 2,
  });
  components.push(recentSessionsHeader);

  const recentSessionsRows: { text: Signal<string>; component: Text }[] = [];
  for (let i = 1; i < recentSessionsHeight; i++) {
    const rowText = new Signal<string>("");
    const text = new Text({
      parent: tui,
      text: rowText,
      theme: { base: crayon.bgBlack.white },
      rectangle: { column: rectangle.column, row: recentSessionsRow + i },
      zIndex: 2,
    });
    recentSessionsRows.push({ text: rowText, component: text });
    components.push(text);
  }

  // =========================================================================
  // UPDATE FUNCTIONS
  // =========================================================================

  const updatePromptSection = () => {
    const drone = state.selectedDrone.value;

    if (!drone) {
      if (promptRows[0]) promptRows[0].text.value = padLine(" Select a drone to view details", rectangle.width);
      for (let i = 1; i < promptRows.length; i++) {
        promptRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Show prompt content (word-wrapped)
    const prompt = drone.prompt || "(no prompt)";
    const lines = wordWrap(prompt, rectangle.width - 2);

    for (let i = 0; i < promptRows.length; i++) {
      if (i < lines.length) {
        promptRows[i].text.value = padLine(" " + lines[i], rectangle.width);
      } else {
        promptRows[i].text.value = " ".repeat(rectangle.width);
      }
    }
  };

  const updateConfigSection = () => {
    const drone = state.selectedDrone.value;

    if (!drone) {
      for (let i = 0; i < configRows.length; i++) {
        configRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Show configuration
    if (configRows[0]) {
      const configLine = ` Max iterations: ${drone.max_iterations}  Timeout: ${drone.timeout_minutes}m  Cooldown: ${drone.cooldown_seconds}s`;
      configRows[0].text.value = padLine(configLine, rectangle.width);
    }
    if (configRows[1]) {
      const statusLine = ` Status: ${drone.status}  Updated: ${relativeTime(drone.updated_at)}`;
      configRows[1].text.value = padLine(statusLine, rectangle.width);
    }
  };

  const updateCurrentSessionSection = () => {
    const drone = state.selectedDrone.value;
    const items = state.droneListItems.value;
    const item = items.find(i => i.id === drone?.id);

    if (!drone || !item) {
      for (let i = 0; i < currentSessionRows.length; i++) {
        currentSessionRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    const currentSession = item.currentSession;

    if (!currentSession) {
      if (currentSessionRows[0]) {
        currentSessionRows[0].text.value = padLine(" No active session", rectangle.width);
      }
      if (currentSessionRows[1]) {
        currentSessionRows[1].text.value = padLine(" Press 's' to start", rectangle.width);
      }
      for (let i = 2; i < currentSessionRows.length; i++) {
        currentSessionRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Show current session details
    if (currentSessionRows[0]) {
      const statusLine = ` Status: ${currentSession.status} [${currentSession.iteration}/${drone.max_iterations}]  Branch: ${currentSession.git_branch || "none"}`;
      currentSessionRows[0].text.value = padLine(statusLine, rectangle.width);
    }
    if (currentSessionRows[1]) {
      const startedLine = ` Started: ${relativeTime(currentSession.started_at)}`;
      currentSessionRows[1].text.value = padLine(startedLine, rectangle.width);
    }
    if (currentSessionRows[2]) {
      const hintLine = " Press 'S' to stop";
      currentSessionRows[2].text.value = padLine(hintLine, rectangle.width);
    }
  };

  const updateLiveActivitySection = () => {
    const drone = state.selectedDrone.value;

    if (!drone) {
      for (let i = 0; i < liveActivityRows.length; i++) {
        liveActivityRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    const events = state.droneEvents.value.get(drone.id) || [];

    if (events.length === 0) {
      if (liveActivityRows[0]) {
        liveActivityRows[0].text.value = padLine(" No activity yet", rectangle.width);
      }
      for (let i = 1; i < liveActivityRows.length; i++) {
        liveActivityRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Show recent events (most recent first, auto-scrolling)
    const recentEvents = events.slice(-liveActivityRows.length).reverse();

    for (let i = 0; i < liveActivityRows.length; i++) {
      if (i < recentEvents.length) {
        const event = recentEvents[i];
        liveActivityRows[i].text.value = formatEventRow(event, rectangle.width);
      } else {
        liveActivityRows[i].text.value = " ".repeat(rectangle.width);
      }
    }
  };

  const updateRecentSessionsSection = () => {
    const drone = state.selectedDrone.value;
    const items = state.droneListItems.value;
    const item = items.find(i => i.id === drone?.id);

    if (!drone || !item) {
      for (let i = 0; i < recentSessionsRows.length; i++) {
        recentSessionsRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Filter out current session from recent sessions
    const recentSessions = item.recentSessions.filter(
      s => s.status !== 'running'
    ).slice(0, recentSessionsRows.length);

    if (recentSessions.length === 0) {
      if (recentSessionsRows[0]) {
        recentSessionsRows[0].text.value = padLine(" No previous sessions", rectangle.width);
      }
      for (let i = 1; i < recentSessionsRows.length; i++) {
        recentSessionsRows[i].text.value = " ".repeat(rectangle.width);
      }
      return;
    }

    // Show recent sessions
    for (let i = 0; i < recentSessionsRows.length; i++) {
      if (i < recentSessions.length) {
        const session = recentSessions[i];
        const statusIcon = session.status === 'completed' ? 'x' :
                          session.status === 'stopped' ? '-' : '!';
        const line = ` [${statusIcon}] ${relativeTime(session.started_at)}  ${session.iteration} iters  ${session.git_branch || "no branch"}`;
        recentSessionsRows[i].text.value = padLine(line, rectangle.width);
      } else {
        recentSessionsRows[i].text.value = " ".repeat(rectangle.width);
      }
    }
  };

  // Subscribe to state changes
  state.selectedDrone.subscribe(updatePromptSection);
  state.selectedDrone.subscribe(updateConfigSection);
  state.selectedDrone.subscribe(updateCurrentSessionSection);
  state.selectedDrone.subscribe(updateLiveActivitySection);
  state.selectedDrone.subscribe(updateRecentSessionsSection);
  state.droneListItems.subscribe(updateCurrentSessionSection);
  state.droneListItems.subscribe(updateRecentSessionsSection);
  state.droneEvents.subscribe(updateLiveActivitySection);

  // Initial render
  updatePromptSection();
  updateConfigSection();
  updateCurrentSessionSection();
  updateLiveActivitySection();
  updateRecentSessionsSection();

  // Set up animation timer for live activity - updates every 2 seconds
  const animationInterval = setInterval(() => {
    const drone = state.selectedDrone.value;
    const items = state.droneListItems.value;
    const item = items.find(i => i.id === drone?.id);
    if (item?.currentSession?.status === 'running') {
      updateLiveActivitySection();
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
 * Word wrap text to fit within a given width.
 */
function wordWrap(text: string, width: number): string[] {
  const lines: string[] = [];
  const words = text.split(/\s+/);
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word.slice(0, width);
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
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
 * Create relative time string.
 */
function relativeTime(dateStr: string): string {
  const result = relativeTimeUtil(dateStr);
  return result.replace(" ago", "").replace("just now", "now");
}
