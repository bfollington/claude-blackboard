/**
 * Git utility functions.
 */

/**
 * Gets the current git branch name.
 * @returns The branch name, or null if not in a git repo or git is unavailable.
 */
export function getCurrentGitBranch(): string | null {
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
