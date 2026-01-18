/**
 * Utility for reading and parsing JSON from stdin.
 * Used by hook handlers to receive input from Claude Code.
 */

/**
 * Reads all data from stdin and parses it as JSON.
 * Returns the parsed object with the specified type.
 *
 * @template T - Expected type of the parsed JSON
 * @returns Promise resolving to the parsed JSON object
 * @throws Error if stdin cannot be read or JSON is invalid
 */
export async function readStdin<T>(): Promise<T> {
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];

  for await (const chunk of Deno.stdin.readable) {
    chunks.push(chunk);
  }

  // Concatenate all chunks into a single Uint8Array
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const text = decoder.decode(combined);
  return JSON.parse(text) as T;
}
