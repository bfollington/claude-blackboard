/**
 * ID generation utility for database records.
 * Generates 8-character hex IDs matching the bash script behavior.
 */

/**
 * Generates a random 8-character hex ID.
 * Matches the behavior of `openssl rand -hex 4` in the original bash scripts.
 *
 * @returns 8-character hexadecimal string
 */
export function generateId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
