/**
 * TypeScript types for hook input/output payloads.
 * Hooks communicate via JSON stdin/stdout.
 */

// Common hook output structure
export interface HookOutput {
  systemMessage?: string;
  userMessage?: string;
  error?: string;
}

// SessionStart hook handlers

export interface SessionStartInput {
  sessionId?: string;
  workingDirectory?: string;
  [key: string]: unknown;
}

export interface SessionStartOutput extends HookOutput {
  // init-db: May include systemMessage if DB created
  // check-resume: May include systemMessage with resumption instructions
}

// PreToolUse hook handlers

export interface PreToolUseInput {
  toolName: string;
  toolInput: unknown;
  conversationHistory?: unknown[];
  [key: string]: unknown;
}

export interface PreToolUseOutput extends HookOutput {
  // store-plan: Extracts plan from ExitPlanMode, stores in DB
}

// PostToolUse hook handlers

export interface PostToolUseInput {
  toolName: string;
  toolInput: unknown;
  toolOutput?: unknown;
  conversationHistory?: unknown[];
  [key: string]: unknown;
}

export interface PostToolUseOutput extends HookOutput {
  // inject-orchestration: Returns systemMessage with orchestrator instructions
  // capture-todo: Syncs TodoWrite items to plan_steps
}

// SubagentStop hook handlers

export interface SubagentStopInput {
  agentType?: string;
  completionReason?: string;
  stepId?: string;
  planId?: string;
  [key: string]: unknown;
}

export interface SubagentStopOutput extends HookOutput {
  // update-step-status: Marks step as completed
}

// PreCompact hook handlers

export interface PreCompactInput {
  messageCount?: number;
  estimatedTokens?: number;
  [key: string]: unknown;
}

export interface PreCompactOutput extends HookOutput {
  // prompt-reflect: Suggests capturing a reflection before compaction
}

// ExitPlanMode tool input structure (for store-plan hook)
export interface ExitPlanModeInput {
  plan?: string;
  todos?: string[];
  [key: string]: unknown;
}

// TodoWrite tool input structure (for capture-todo hook)
export interface TodoWriteInput {
  todos?: Array<{
    description: string;
    priority?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}
