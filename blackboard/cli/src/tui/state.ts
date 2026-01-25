/**
 * Reactive state management for the TUI dashboard.
 * Uses deno_tui signals for automatic UI updates when data changes.
 */

import { Signal, Computed } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import type {
  Thread,
  Plan,
  PlanStep,
  Breadcrumb,
  BugReport,
  ThreadStatus,
  BugReportStatus,
  Worker,
} from "../types/schema.ts";
import { relativeTime as relativeTimeUtil } from "../utils/time.ts";
import {
  listThreads,
  getStepsForPlan,
  getRecentBreadcrumbs,
  updateThread,
  updateStepStatus,
  replaceStepsForPlan,
  getPlanById,
  updatePlanMarkdown,
  updateStepDescription,
  updateBreadcrumbSummary,
  listBugReports,
  updateBugReportStatus,
  insertThread,
  resolveThread,
  insertPlan,
} from "../db/queries.ts";
import { getActiveWorkers, updateWorkerStatus, insertWorker } from "../db/worker-queries.ts";
import { dockerRun, dockerKill, isDockerAvailable, parseEnvFile, type ContainerOptions } from "../docker/client.ts";
import { join } from "jsr:@std/path";
import { generateId } from "../utils/id.ts";
import { dirname } from "jsr:@std/path";
import { resolveDbPath } from "../db/connection.ts";

// Tab identifiers for the main navigation
export type TabId = "threads" | "bugs" | "reflections";

// Pane identifiers for focus management within the threads tab
export type PaneId = "list" | "plan" | "steps" | "crumbs";

// Status filter for thread list
export type ThreadFilter = "all" | ThreadStatus;

// Status filter for bug list
export type BugFilter = "all" | BugReportStatus;

// Find/search state
export interface FindMatch {
  lineIndex: number;
  matchIndex: number;
  matchLength: number;
}

export interface FindState {
  isActive: boolean;
  query: string;
  matches: FindMatch[];
  currentMatchIndex: number;
}

/**
 * Thread with computed display data for the list view.
 */
export interface ThreadListItem extends Thread {
  pendingStepsCount: number;
  lastUpdatedRelative: string;
  workerCount: number;
}

/**
 * Bug report with computed display data for the list view.
 */
export interface BugListItem extends BugReport {
  titleTruncated: string;
  createdAtRelative: string;
}

/**
 * Core TUI state interface.
 * All mutable state is wrapped in signals for reactivity.
 */
export interface TuiState {
  // Navigation state
  activeTab: Signal<TabId>;
  focusedPane: Signal<PaneId>;

  // Thread list state
  threads: Signal<Thread[]>;
  selectedThreadIndex: Signal<number>;
  threadFilter: Signal<ThreadFilter>;

  // Detail panel state (for selected thread)
  selectedPlan: Signal<Plan | null>;
  steps: Signal<PlanStep[]>;
  breadcrumbs: Signal<Breadcrumb[]>;
  selectedStepIndex: Signal<number>;
  selectedCrumbIndex: Signal<number>;

  // Worker state
  workers: Signal<Worker[]>;
  workerError: Signal<string>;

  // Bug reports state
  bugReports: Signal<BugReport[]>;
  selectedBugIndex: Signal<number>;
  bugFilter: Signal<BugFilter>;

  // Computed values
  selectedThread: Computed<Thread | null>;
  filteredThreads: Computed<Thread[]>;
  threadListItems: Computed<ThreadListItem[]>;
  workersForSelectedThread: Computed<Worker[]>;
  threadWorkerCounts: Computed<Map<string, number>>;
  selectedBug: Computed<BugReport | null>;
  filteredBugs: Computed<BugReport[]>;
  bugListItems: Computed<BugListItem[]>;

  // UI state
  shouldQuit: Signal<boolean>;
  isLoading: Signal<boolean>;
  statusMessage: Signal<string>;

  // Thread creation state
  isCreatingThread: Signal<boolean>;
  newThreadName: Signal<string>;

  // Confirmation dialog state
  isConfirming: Signal<boolean>;
  confirmMessage: Signal<string>;
  confirmAction: Signal<(() => void) | null>;

  // Find/search state
  findState: Signal<FindState>;
}

/**
 * Create a relative time string from a date.
 * Delegates to the shared utility function.
 */
function relativeTime(dateStr: string): string {
  return relativeTimeUtil(dateStr);
}

/**
 * Gets the current git branch.
 */
function getCurrentGitBranch(): string | null {
  try {
    const command = new Deno.Command("git", {
      args: ["rev-parse", "--abbrev-ref", "HEAD"],
      stdout: "piped",
      stderr: "null",
    });
    const result = command.outputSync();
    if (result.success) {
      return new TextDecoder().decode(result.stdout).trim();
    }
  } catch {
    // Not in a git repo or git not available
  }
  return null;
}

/**
 * Merges a git branch into the current branch.
 * Returns null on success, or an error message on failure.
 */
function mergeGitBranch(branchName: string): string | null {
  try {
    const command = new Deno.Command("git", {
      args: ["merge", branchName, "--no-edit"],
      stdout: "piped",
      stderr: "piped",
    });
    const result = command.outputSync();
    if (result.success) {
      return null;
    } else {
      const stderr = new TextDecoder().decode(result.stderr).trim();
      return stderr || "Merge failed";
    }
  } catch (err) {
    return err instanceof Error ? err.message : "Merge failed";
  }
}

/**
 * Create and initialize the TUI state.
 * Loads initial data from the database.
 */
export function createTuiState(): TuiState {
  // Navigation state
  const activeTab = new Signal<TabId>("threads");
  const focusedPane = new Signal<PaneId>("list");

  // Thread list state
  const threads = new Signal<Thread[]>([]);
  const selectedThreadIndex = new Signal<number>(0);
  const threadFilter = new Signal<ThreadFilter>("all");

  // Detail panel state
  const selectedPlan = new Signal<Plan | null>(null);
  const steps = new Signal<PlanStep[]>([]);
  const breadcrumbs = new Signal<Breadcrumb[]>([]);
  const selectedStepIndex = new Signal<number>(0);
  const selectedCrumbIndex = new Signal<number>(0);

  // Worker state
  const workers = new Signal<Worker[]>([]);
  const workerError = new Signal<string>("");

  // Bug reports state
  const bugReports = new Signal<BugReport[]>([]);
  const selectedBugIndex = new Signal<number>(0);
  const bugFilter = new Signal<BugFilter>("all");

  // UI state
  const shouldQuit = new Signal<boolean>(false);
  const isLoading = new Signal<boolean>(false);
  const statusMessage = new Signal<string>("");

  // Thread creation state
  const isCreatingThread = new Signal<boolean>(false);
  const newThreadName = new Signal<string>("");

  // Confirmation dialog state
  const isConfirming = new Signal<boolean>(false);
  const confirmMessage = new Signal<string>("");
  const confirmAction = new Signal<(() => void) | null>(null);

  // Find/search state
  const findState = new Signal<FindState>({
    isActive: false,
    query: "",
    matches: [],
    currentMatchIndex: -1,
  });

  // Computed: filter threads based on current filter
  const filteredThreads = new Computed<Thread[]>(() => {
    const filter = threadFilter.value;
    const allThreads = threads.value;
    if (filter === "all") {
      return allThreads;
    }
    return allThreads.filter((t) => t.status === filter);
  });

  // Computed: get currently selected thread
  const selectedThread = new Computed<Thread | null>(() => {
    const filtered = filteredThreads.value;
    const index = selectedThreadIndex.value;
    if (index >= 0 && index < filtered.length) {
      return filtered[index];
    }
    return null;
  });

  // Computed: workers for selected thread
  const workersForSelectedThread = new Computed<Worker[]>(() => {
    const thread = selectedThread.value;
    if (!thread) return [];
    return workers.value.filter(w => w.thread_id === thread.id && w.status === 'running');
  });

  // Computed: worker counts per thread
  const threadWorkerCounts = new Computed<Map<string, number>>(() => {
    const counts = new Map<string, number>();
    for (const worker of workers.value) {
      if (worker.status === 'running') {
        const current = counts.get(worker.thread_id) || 0;
        counts.set(worker.thread_id, current + 1);
      }
    }
    return counts;
  });

  // Computed: thread list items with display data
  const threadListItems = new Computed<ThreadListItem[]>(() => {
    const filtered = filteredThreads.value;
    const workerCounts = threadWorkerCounts.value;
    return filtered.map((thread) => {
      // Count pending steps if thread has a plan
      let pendingStepsCount = 0;
      if (thread.current_plan_id) {
        const threadSteps = getStepsForPlan(thread.current_plan_id);
        pendingStepsCount = threadSteps.filter(
          (s) => s.status === "pending" || s.status === "in_progress"
        ).length;
      }
      return {
        ...thread,
        pendingStepsCount,
        lastUpdatedRelative: relativeTime(thread.updated_at),
        workerCount: workerCounts.get(thread.id) || 0,
      };
    });
  });

  // Computed: filter bug reports based on current filter
  const filteredBugs = new Computed<BugReport[]>(() => {
    const filter = bugFilter.value;
    const allBugs = bugReports.value;
    if (filter === "all") {
      return allBugs;
    }
    return allBugs.filter((b) => b.status === filter);
  });

  // Computed: get currently selected bug
  const selectedBug = new Computed<BugReport | null>(() => {
    const filtered = filteredBugs.value;
    const index = selectedBugIndex.value;
    if (index >= 0 && index < filtered.length) {
      return filtered[index];
    }
    return null;
  });

  // Computed: bug list items with display data
  const bugListItems = new Computed<BugListItem[]>(() => {
    const filtered = filteredBugs.value;
    return filtered.map((bug) => {
      // Truncate title to max 60 chars
      const maxTitleLength = 60;
      const titleTruncated = bug.title.length > maxTitleLength
        ? bug.title.substring(0, maxTitleLength - 1) + "~"
        : bug.title;

      return {
        ...bug,
        titleTruncated,
        createdAtRelative: relativeTime(bug.created_at),
      };
    });
  });

  return {
    activeTab,
    focusedPane,
    threads,
    selectedThreadIndex,
    threadFilter,
    selectedPlan,
    steps,
    breadcrumbs,
    selectedStepIndex,
    selectedCrumbIndex,
    workers,
    workerError,
    bugReports,
    selectedBugIndex,
    bugFilter,
    selectedThread,
    filteredThreads,
    threadListItems,
    workersForSelectedThread,
    threadWorkerCounts,
    selectedBug,
    filteredBugs,
    bugListItems,
    shouldQuit,
    isLoading,
    statusMessage,
    isCreatingThread,
    newThreadName,
    isConfirming,
    confirmMessage,
    confirmAction,
    findState,
  };
}

/**
 * Actions for mutating state and syncing with database.
 */
export interface TuiActions {
  // Data loading
  loadThreads: () => void;
  loadThreadDetails: (thread: Thread) => void;
  refreshCurrentThread: () => void;

  // Navigation
  selectThread: (index: number) => void;
  moveThreadSelection: (delta: number) => void;
  cycleThreadFilter: () => void;
  switchTab: (tab: TabId) => void;
  cycleFocus: () => void;

  // Step operations
  selectStep: (index: number) => void;
  moveStepSelection: (delta: number) => void;
  toggleStepStatus: (index: number) => void;
  moveStep: (fromIndex: number, toIndex: number) => void;

  // Breadcrumb operations
  selectCrumb: (index: number) => void;
  moveCrumbSelection: (delta: number) => void;

  // Thread operations
  archiveThread: (thread: Thread) => void;
  toggleThreadPause: (thread: Thread) => void;
  mergeThread: (thread: Thread) => void;

  // Thread creation
  startCreateThread: () => void;
  updateNewThreadName: (name: string) => void;
  confirmCreateThread: () => void;
  cancelCreateThread: () => void;

  // Confirmation dialog
  showConfirmation: (message: string, onConfirm: () => void) => void;
  confirmDialogYes: () => void;
  confirmDialogNo: () => void;

  // Worker operations
  loadWorkers: () => void;
  spawnWorker: (thread: Thread) => Promise<void>;
  killWorker: (workerId: string) => Promise<void>;
  killAllWorkersForThread: (thread: Thread) => Promise<void>;

  // Bug report operations
  loadBugReports: () => void;
  selectBug: (index: number) => void;
  moveBugSelection: (delta: number) => void;
  cycleBugFilter: () => void;
  updateBugStatus: (bug: BugReport, status: BugReportStatus) => void;

  // Auto-refresh
  refreshAll: () => void;

  // UI
  setStatusMessage: (message: string) => void;
  quit: () => void;

  // Find operations
  startFind: () => void;
  updateFindQuery: (query: string) => void;
  findNext: () => void;
  findPrevious: () => void;
  exitFind: () => void;
  clearFind: () => void;

  // Edit operations (return content for external editor)
  getPlanMarkdown: () => string | null;
  savePlanMarkdown: (markdown: string) => void;
  createPlan: (markdown: string) => void;
  getStepDescription: (index: number) => string | null;
  saveStepDescription: (index: number, description: string) => void;
  getCrumbSummary: (index: number) => string | null;
  saveCrumbSummary: (index: number, summary: string) => void;
}

/**
 * Create actions bound to the given state.
 */
export function createTuiActions(state: TuiState): TuiActions {
  const filterOrder: ThreadFilter[] = [
    "all",
    "active",
    "paused",
    "completed",
    "archived",
  ];

  // Helper function to jump to a match by directly manipulating state
  const jumpToMatch = (matchIndex: number, matches: FindMatch[], pane: PaneId) => {
    if (matchIndex < 0 || matchIndex >= matches.length) return;

    const match = matches[matchIndex];

    // Update selection based on focused pane
    if (pane === "steps") {
      state.selectedStepIndex.value = match.lineIndex;
    } else if (pane === "crumbs") {
      state.selectedCrumbIndex.value = match.lineIndex;
    } else if (pane === "list") {
      state.selectedThreadIndex.value = match.lineIndex;
    }
    // For "plan" pane, we can't jump to a specific line easily,
    // but the match highlighting will show it
  };

  return {
    loadThreads() {
      state.isLoading.value = true;
      try {
        const filter = state.threadFilter.value;
        const threadList =
          filter === "all" ? listThreads() : listThreads(filter);
        state.threads.value = threadList;

        // Reset selection if out of bounds
        if (state.selectedThreadIndex.value >= threadList.length) {
          state.selectedThreadIndex.value = Math.max(0, threadList.length - 1);
        }

        // Load details for selected thread
        const selected = state.selectedThread.value;
        if (selected) {
          this.loadThreadDetails(selected);
        }
      } finally {
        state.isLoading.value = false;
      }
    },

    loadThreadDetails(thread: Thread) {
      if (thread.current_plan_id) {
        state.steps.value = getStepsForPlan(thread.current_plan_id);
        state.breadcrumbs.value = getRecentBreadcrumbs(
          thread.current_plan_id,
          20
        );
      } else {
        state.steps.value = [];
        state.breadcrumbs.value = [];
      }
      // Reset detail selections
      state.selectedStepIndex.value = 0;
      state.selectedCrumbIndex.value = 0;
    },

    refreshCurrentThread() {
      const thread = state.selectedThread.value;
      if (thread) {
        this.loadThreadDetails(thread);
      }
    },

    selectThread(index: number) {
      const filtered = state.filteredThreads.value;
      if (index >= 0 && index < filtered.length) {
        state.selectedThreadIndex.value = index;
        this.loadThreadDetails(filtered[index]);
      }
    },

    moveThreadSelection(delta: number) {
      const filtered = state.filteredThreads.value;
      const newIndex = state.selectedThreadIndex.value + delta;
      if (newIndex >= 0 && newIndex < filtered.length) {
        this.selectThread(newIndex);
      }
    },

    cycleThreadFilter() {
      const currentIndex = filterOrder.indexOf(state.threadFilter.value);
      const nextIndex = (currentIndex + 1) % filterOrder.length;
      state.threadFilter.value = filterOrder[nextIndex];
      state.selectedThreadIndex.value = 0;
      this.loadThreads();
    },

    switchTab(tab: TabId) {
      state.activeTab.value = tab;
      state.focusedPane.value = "list";
    },

    cycleFocus() {
      const paneOrder: PaneId[] = ["list", "plan", "steps", "crumbs"];
      const currentIndex = paneOrder.indexOf(state.focusedPane.value);
      const nextIndex = (currentIndex + 1) % paneOrder.length;
      state.focusedPane.value = paneOrder[nextIndex];
    },

    selectStep(index: number) {
      const stepList = state.steps.value;
      if (index >= 0 && index < stepList.length) {
        state.selectedStepIndex.value = index;
      }
    },

    moveStepSelection(delta: number) {
      const newIndex = state.selectedStepIndex.value + delta;
      this.selectStep(newIndex);
    },

    toggleStepStatus(index: number) {
      const stepList = state.steps.value;
      if (index < 0 || index >= stepList.length) return;

      const step = stepList[index];
      const newStatus =
        step.status === "completed" ? "pending" : "completed";

      // Update database
      updateStepStatus(step.id, newStatus);

      // Update local state
      const updated = [...stepList];
      updated[index] = { ...step, status: newStatus };
      state.steps.value = updated;

      this.setStatusMessage(
        `Step ${newStatus === "completed" ? "completed" : "marked pending"}`
      );
    },

    moveStep(fromIndex: number, toIndex: number) {
      const stepList = state.steps.value;
      if (
        fromIndex < 0 ||
        fromIndex >= stepList.length ||
        toIndex < 0 ||
        toIndex >= stepList.length
      ) {
        return;
      }

      const thread = state.selectedThread.value;
      if (!thread?.current_plan_id) return;

      // Reorder in memory
      const updated = [...stepList];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);

      // Update step_order values
      const reordered = updated.map((step, idx) => ({
        ...step,
        step_order: idx,
      }));

      // Persist to database
      replaceStepsForPlan(
        thread.current_plan_id,
        reordered.map((s) => ({
          step_order: s.step_order,
          description: s.description,
          status: s.status,
        }))
      );

      // Reload steps to get new IDs
      state.steps.value = getStepsForPlan(thread.current_plan_id);
      state.selectedStepIndex.value = toIndex;

      this.setStatusMessage("Step reordered");
    },

    selectCrumb(index: number) {
      const crumbList = state.breadcrumbs.value;
      if (index >= 0 && index < crumbList.length) {
        state.selectedCrumbIndex.value = index;
      }
    },

    moveCrumbSelection(delta: number) {
      const newIndex = state.selectedCrumbIndex.value + delta;
      this.selectCrumb(newIndex);
    },

    archiveThread(thread: Thread) {
      // Check if thread has active workers
      const threadWorkers = state.workers.value.filter(
        w => w.thread_id === thread.id && w.status === 'running'
      );

      if (threadWorkers.length > 0) {
        this.setStatusMessage(`Cannot archive: ${threadWorkers.length} active worker(s)`);
        return;
      }

      updateThread(thread.id, { status: "archived" });
      this.loadThreads();
      this.setStatusMessage(`Thread "${thread.name}" archived`);
    },

    toggleThreadPause(thread: Thread) {
      const newStatus: ThreadStatus =
        thread.status === "paused" ? "active" : "paused";
      updateThread(thread.id, { status: newStatus });
      this.loadThreads();
      this.setStatusMessage(
        `Thread "${thread.name}" ${newStatus === "paused" ? "paused" : "resumed"}`
      );
    },

    mergeThread(thread: Thread) {
      // Check if thread has active workers
      const threadWorkers = state.workers.value.filter(
        w => w.thread_id === thread.id && w.status === 'running'
      );

      if (threadWorkers.length > 0) {
        this.setStatusMessage(`Cannot merge: ${threadWorkers.length} active worker(s)`);
        return;
      }

      // Get thread's git branches
      if (!thread.git_branches) {
        this.setStatusMessage("Thread has no associated git branch");
        return;
      }

      const branches = thread.git_branches.split(",").map(b => b.trim()).filter(b => b);
      if (branches.length === 0) {
        this.setStatusMessage("Thread has no associated git branch");
        return;
      }

      // Use the last branch (most recent)
      const threadBranch = branches[branches.length - 1];

      // Get current branch
      const currentBranch = getCurrentGitBranch();
      if (!currentBranch) {
        this.setStatusMessage("Failed to get current git branch");
        return;
      }

      if (currentBranch === threadBranch) {
        this.setStatusMessage("Already on thread branch - switch to target branch first");
        return;
      }

      // Show confirmation dialog
      const message = `Merge "${threadBranch}" into "${currentBranch}" and archive thread?`;
      this.showConfirmation(message, () => {
        // Perform the merge
        const error = mergeGitBranch(threadBranch);
        if (error) {
          this.setStatusMessage(`Merge failed: ${error.slice(0, 50)}`);
          return;
        }

        // Archive the thread after successful merge
        updateThread(thread.id, { status: "archived" });
        this.loadThreads();
        this.setStatusMessage(`Merged "${threadBranch}" into "${currentBranch}" and archived thread`);
      });
    },

    startCreateThread() {
      state.isCreatingThread.value = true;
      state.newThreadName.value = "";
    },

    updateNewThreadName(name: string) {
      state.newThreadName.value = name;
    },

    confirmCreateThread() {
      const name = state.newThreadName.value.trim();

      // Validate kebab-case
      if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
        this.setStatusMessage("Name must be kebab-case (e.g., my-feature)");
        return;
      }

      // Check if exists
      const existing = resolveThread(name);
      if (existing) {
        this.setStatusMessage(`Thread "${name}" already exists`);
        return;
      }

      // Create thread
      const threadId = generateId();
      insertThread({
        id: threadId,
        name,
        current_plan_id: null,
        git_branches: null,
        status: "active",
      });

      state.isCreatingThread.value = false;
      state.newThreadName.value = "";
      this.loadThreads();
      this.setStatusMessage(`Thread "${name}" created`);
    },

    cancelCreateThread() {
      state.isCreatingThread.value = false;
      state.newThreadName.value = "";
    },

    showConfirmation(message: string, onConfirm: () => void) {
      state.confirmMessage.value = message;
      state.confirmAction.value = onConfirm;
      state.isConfirming.value = true;
    },

    confirmDialogYes() {
      const action = state.confirmAction.value;
      state.isConfirming.value = false;
      state.confirmMessage.value = "";
      state.confirmAction.value = null;
      if (action) {
        action();
      }
    },

    confirmDialogNo() {
      state.isConfirming.value = false;
      state.confirmMessage.value = "";
      state.confirmAction.value = null;
      this.setStatusMessage("Cancelled");
    },

    loadWorkers() {
      const activeWorkers = getActiveWorkers();
      state.workers.value = activeWorkers;
    },

    async spawnWorker(thread: Thread) {
      // Clear previous error
      state.workerError.value = "";

      // Check Docker availability
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        state.workerError.value = "Docker not available - is Docker running?";
        this.setStatusMessage("Docker not available");
        return;
      }

      // Generate worker ID
      const workerId = generateId();

      // Resolve paths
      const dbPath = resolveDbPath();
      const dbDir = dirname(dbPath);
      const repoDir = Deno.cwd();

      // Load environment variables from .env file in repo root
      const envFilePath = join(repoDir, ".env");
      const envVars = await parseEnvFile(envFilePath);

      // Check for API key (from .env or environment)
      const apiKey = envVars["ANTHROPIC_API_KEY"] || Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) {
        state.workerError.value = "ANTHROPIC_API_KEY not set in .env or environment";
        this.setStatusMessage("ANTHROPIC_API_KEY not set");
        return;
      }

      try {
        this.setStatusMessage("Spawning worker...");
        const containerOptions: ContainerOptions = {
          image: "blackboard-worker:latest",
          threadName: thread.name,
          dbDir,
          repoDir,
          authMode: "env",
          apiKey,
          maxIterations: 50,
          memory: "512m",
          workerId,
          envVars, // Pass all env vars from .env file
        };

        const containerId = await dockerRun(containerOptions);

        insertWorker({
          id: workerId,
          container_id: containerId,
          thread_id: thread.id,
          status: "running",
          auth_mode: "env",
          iteration: 0,
          max_iterations: 50,
        });

        this.loadWorkers();
        this.setStatusMessage(`Worker ${workerId.slice(0, 7)} spawned`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        state.workerError.value = `Spawn failed: ${msg}`;
        this.setStatusMessage(`Spawn failed: ${msg.slice(0, 40)}`);
      }
    },

    async killWorker(workerId: string) {
      const worker = state.workers.value.find(w => w.id === workerId);
      if (!worker) {
        this.setStatusMessage("Worker not found");
        return;
      }

      try {
        await dockerKill(worker.container_id);
      } catch {
        // Container may already be dead
      }

      updateWorkerStatus(workerId, "killed");
      this.loadWorkers();
      this.setStatusMessage(`Worker ${workerId.slice(0, 7)} killed`);
    },

    async killAllWorkersForThread(thread: Thread) {
      const threadWorkers = state.workers.value.filter(
        w => w.thread_id === thread.id && w.status === 'running'
      );

      for (const worker of threadWorkers) {
        try {
          await dockerKill(worker.container_id);
        } catch {
          // Container may already be dead
        }
        updateWorkerStatus(worker.id, "killed");
      }

      this.loadWorkers();
      this.setStatusMessage(`Killed ${threadWorkers.length} worker(s)`);
    },

    loadBugReports() {
      state.isLoading.value = true;
      try {
        const filter = state.bugFilter.value;
        const bugList =
          filter === "all" ? listBugReports() : listBugReports(filter);
        state.bugReports.value = bugList;

        // Reset selection if out of bounds
        if (state.selectedBugIndex.value >= bugList.length) {
          state.selectedBugIndex.value = Math.max(0, bugList.length - 1);
        }
      } finally {
        state.isLoading.value = false;
      }
    },

    selectBug(index: number) {
      const filtered = state.filteredBugs.value;
      if (index >= 0 && index < filtered.length) {
        state.selectedBugIndex.value = index;
      }
    },

    moveBugSelection(delta: number) {
      const filtered = state.filteredBugs.value;
      const newIndex = state.selectedBugIndex.value + delta;
      if (newIndex >= 0 && newIndex < filtered.length) {
        this.selectBug(newIndex);
      }
    },

    cycleBugFilter() {
      const bugFilterOrder: BugFilter[] = ["all", "open", "resolved", "wontfix"];
      const currentIndex = bugFilterOrder.indexOf(state.bugFilter.value);
      const nextIndex = (currentIndex + 1) % bugFilterOrder.length;
      state.bugFilter.value = bugFilterOrder[nextIndex];
      state.selectedBugIndex.value = 0;
      this.loadBugReports();
    },

    updateBugStatus(bug: BugReport, status: BugReportStatus) {
      updateBugReportStatus(bug.id, status);
      this.loadBugReports();
      const statusLabel = status === "open" ? "reopened" : status;
      this.setStatusMessage(`Bug "${bug.title.substring(0, 30)}..." ${statusLabel}`);
    },

    refreshAll() {
      this.loadThreads();
      this.loadWorkers();
      const thread = state.selectedThread.value;
      if (thread) {
        this.loadThreadDetails(thread);
      }
      // Also refresh bugs when on bugs tab
      if (state.activeTab.value === "bugs") {
        this.loadBugReports();
      }
    },

    setStatusMessage(message: string) {
      state.statusMessage.value = message;
      // Auto-clear after 3 seconds
      setTimeout(() => {
        if (state.statusMessage.value === message) {
          state.statusMessage.value = "";
        }
      }, 3000);
    },

    quit() {
      state.shouldQuit.value = true;
    },

    // Find operations
    startFind() {
      state.findState.value = {
        isActive: true,
        query: "",
        matches: [],
        currentMatchIndex: -1,
      };
    },

    updateFindQuery(query: string) {
      const currentFind = state.findState.value;
      if (!currentFind.isActive) return;

      // Search for matches in the currently visible content
      const matches: FindMatch[] = [];

      // Determine which content to search based on focused pane
      let contentLines: string[] = [];
      const focusedPane = state.focusedPane.value;

      if (focusedPane === "plan") {
        // Search in plan markdown
        const planMarkdown = this.getPlanMarkdown();
        if (planMarkdown) {
          contentLines = planMarkdown.split("\n");
        }
      } else if (focusedPane === "steps") {
        // Search in step descriptions
        contentLines = state.steps.value.map((s) => s.description);
      } else if (focusedPane === "crumbs") {
        // Search in breadcrumb summaries
        contentLines = state.breadcrumbs.value.map((c) => c.summary);
      } else if (focusedPane === "list") {
        // Search in thread names
        contentLines = state.filteredThreads.value.map((t) => t.name);
      }

      // Find all matches (case-insensitive)
      if (query) {
        const lowerQuery = query.toLowerCase();
        contentLines.forEach((line, lineIndex) => {
          const lowerLine = line.toLowerCase();
          let matchIndex = 0;
          while ((matchIndex = lowerLine.indexOf(lowerQuery, matchIndex)) !== -1) {
            matches.push({
              lineIndex,
              matchIndex,
              matchLength: query.length,
            });
            matchIndex += query.length;
          }
        });
      }

      state.findState.value = {
        isActive: true,
        query,
        matches,
        currentMatchIndex: matches.length > 0 ? 0 : -1,
      };

      // Jump to first match
      if (matches.length > 0) {
        jumpToMatch(0, matches, state.focusedPane.value);
      }
    },

    findNext() {
      const currentFind = state.findState.value;
      if (currentFind.matches.length === 0) return;

      const nextIndex = (currentFind.currentMatchIndex + 1) % currentFind.matches.length;
      state.findState.value = {
        ...currentFind,
        currentMatchIndex: nextIndex,
      };
      jumpToMatch(nextIndex, currentFind.matches, state.focusedPane.value);
    },

    findPrevious() {
      const currentFind = state.findState.value;
      if (currentFind.matches.length === 0) return;

      const prevIndex = currentFind.currentMatchIndex - 1 < 0
        ? currentFind.matches.length - 1
        : currentFind.currentMatchIndex - 1;
      state.findState.value = {
        ...currentFind,
        currentMatchIndex: prevIndex,
      };
      jumpToMatch(prevIndex, currentFind.matches, state.focusedPane.value);
    },

    exitFind() {
      const currentFind = state.findState.value;
      state.findState.value = {
        ...currentFind,
        isActive: false,
      };
    },

    clearFind() {
      state.findState.value = {
        isActive: false,
        query: "",
        matches: [],
        currentMatchIndex: -1,
      };
    },

    // Edit operations
    getPlanMarkdown() {
      const thread = state.selectedThread.value;
      if (!thread?.current_plan_id) return null;
      const plan = getPlanById(thread.current_plan_id);
      return plan?.plan_markdown ?? null;
    },

    savePlanMarkdown(markdown: string) {
      const thread = state.selectedThread.value;
      if (!thread?.current_plan_id) return;
      updatePlanMarkdown(thread.current_plan_id, markdown);
      this.setStatusMessage("Plan updated");
    },

    createPlan(markdown: string) {
      const thread = state.selectedThread.value;
      if (!thread) return;

      const planId = generateId();
      const description = markdown.split('\n')[0]?.replace(/^#\s*/, '').trim() || 'Untitled plan';

      insertPlan({
        id: planId,
        status: 'accepted',
        description,
        plan_markdown: markdown,
        session_id: null,
        thread_id: thread.id,
      });

      updateThread(thread.id, { current_plan_id: planId });

      // Refresh thread list to get updated thread
      const threads = listThreads(state.threadFilter.value === "all" ? undefined : state.threadFilter.value);
      state.threads.value = threads;

      // Reload details
      const updatedThread = resolveThread(thread.name);
      if (updatedThread) {
        state.selectedThread.value = updatedThread;
        this.loadThreadDetails(updatedThread);
      }

      this.setStatusMessage("Plan created");
    },

    getStepDescription(index: number) {
      const steps = state.steps.value;
      if (index < 0 || index >= steps.length) return null;
      return steps[index].description;
    },

    saveStepDescription(index: number, description: string) {
      const steps = state.steps.value;
      if (index < 0 || index >= steps.length) return;
      const step = steps[index];
      updateStepDescription(step.id, description);
      // Update local state
      const updated = [...steps];
      updated[index] = { ...step, description };
      state.steps.value = updated;
      this.setStatusMessage("Step updated");
    },

    getCrumbSummary(index: number) {
      const crumbs = state.breadcrumbs.value;
      if (index < 0 || index >= crumbs.length) return null;
      return crumbs[index].summary;
    },

    saveCrumbSummary(index: number, summary: string) {
      const crumbs = state.breadcrumbs.value;
      if (index < 0 || index >= crumbs.length) return;
      const crumb = crumbs[index];
      updateBreadcrumbSummary(crumb.id, summary);
      // Update local state
      const updated = [...crumbs];
      updated[index] = { ...crumb, summary };
      state.breadcrumbs.value = updated;
      this.setStatusMessage("Breadcrumb updated");
    },
  };
}

// Re-export for convenience
export { Signal, Computed } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
