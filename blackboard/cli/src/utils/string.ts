/**
 * String utilities for thread name generation.
 */

/**
 * Converts text to kebab-case suitable for thread names.
 * - Lowercases all characters
 * - Replaces non-alphanumeric characters with hyphens
 * - Removes leading/trailing hyphens
 * - Collapses multiple hyphens
 * - Truncates to max 50 characters
 *
 * @param text - Input text (e.g., plan description)
 * @returns kebab-case string suitable for thread name, or empty string if input produces no valid chars
 */
export function toKebabCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, "") // Trim leading/trailing hyphens
    .substring(0, 50);
}
