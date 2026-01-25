/**
 * External editor integration for editing plans, steps, and crumbs.
 * Suspends the TUI, opens the editor, and resumes after editing.
 */

/**
 * Result of an editor session.
 */
export interface EditorResult {
  /** True if content was modified */
  changed: boolean;
  /** The new content (if changed) */
  content: string | null;
  /** Error message if editing failed */
  error: string | null;
}

/**
 * Open content in an external editor.
 * Suspends terminal handling while editor is active.
 *
 * @param content - The content to edit
 * @param suffix - File suffix for temp file (e.g., ".md", ".txt")
 * @returns Result indicating if content changed
 */
export async function editInExternalEditor(
  content: string,
  suffix = ".md"
): Promise<EditorResult> {
  // Create temp file
  const tmpFile = await Deno.makeTempFile({ suffix });

  try {
    // Write content to temp file
    await Deno.writeTextFile(tmpFile, content);

    // Get editor from environment
    const editor = Deno.env.get("EDITOR") || Deno.env.get("VISUAL") || "nvim";

    // Spawn editor process with inherited stdio
    const cmd = new Deno.Command(editor, {
      args: [tmpFile],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    const process = cmd.spawn();
    const status = await process.status;

    if (!status.success) {
      return {
        changed: false,
        content: null,
        error: `Editor exited with code ${status.code}`,
      };
    }

    // Read modified content
    const newContent = await Deno.readTextFile(tmpFile);

    // Check if content changed
    if (newContent !== content) {
      return {
        changed: true,
        content: newContent,
        error: null,
      };
    }

    return {
      changed: false,
      content: null,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      changed: false,
      content: null,
      error: `Failed to edit: ${message}`,
    };
  } finally {
    // Clean up temp file
    try {
      await Deno.remove(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Edit a plan's markdown content in external editor.
 * Call this after suspending the TUI.
 */
export async function editPlanMarkdown(planMarkdown: string): Promise<EditorResult> {
  return await editInExternalEditor(planMarkdown, ".md");
}

/**
 * Edit a step description in external editor.
 */
export async function editStepDescription(description: string): Promise<EditorResult> {
  return await editInExternalEditor(description, ".txt");
}

/**
 * Edit a breadcrumb summary in external editor.
 */
export async function editCrumbSummary(summary: string): Promise<EditorResult> {
  return await editInExternalEditor(summary, ".txt");
}
