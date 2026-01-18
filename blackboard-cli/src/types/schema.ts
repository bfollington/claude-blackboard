/**
 * TypeScript types for blackboard database tables.
 * Based on schema.sql in /blackboard/schema.sql
 */

export type PlanStatus = 'accepted' | 'in_progress' | 'completed' | 'abandoned';
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
export type ReflectionTrigger = 'manual' | 'compact' | 'completion' | 'stop';
export type BugReportStatus = 'open' | 'resolved' | 'wontfix';

export interface Plan {
  id: string;
  created_at: string;
  status: PlanStatus;
  description: string | null;
  plan_markdown: string;
  session_id: string | null;
}

export interface PlanStep {
  id: string;
  plan_id: string;
  step_order: number;
  description: string;
  status: StepStatus;
  created_at: string;
}

export interface Breadcrumb {
  id: string;
  plan_id: string;
  step_id: string | null;
  created_at: string;
  agent_type: string | null;
  summary: string;
  files_touched: string | null;
  issues: string | null;
  next_context: string | null;
}

export interface Reflection {
  id: string;
  plan_id: string | null;
  created_at: string;
  trigger: ReflectionTrigger | null;
  content: string;
}

export interface Correction {
  id: string;
  plan_id: string | null;
  created_at: string;
  mistake: string;
  symptoms: string | null;
  resolution: string | null;
  tags: string | null;
}

export interface BugReport {
  id: string;
  plan_id: string | null;
  created_at: string;
  title: string;
  repro_steps: string;
  evidence: string | null;
  status: BugReportStatus;
}

// View types
export interface ActivePlan extends Plan {}

export interface PendingStep extends PlanStep {
  plan_description: string | null;
}

export interface RecentCrumb extends Breadcrumb {
  plan_description: string | null;
  step_description: string | null;
}
