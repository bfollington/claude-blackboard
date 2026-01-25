/**
 * Dashboard command - Launch interactive TUI for blackboard management.
 */

import { launchTui } from "../tui/mod.ts";

interface DashboardOptions {
  db?: string;
}

/**
 * Launch the interactive TUI dashboard.
 */
export async function dashboardCommand(options: DashboardOptions): Promise<void> {
  await launchTui({ db: options.db });
}
