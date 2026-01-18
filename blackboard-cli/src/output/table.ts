/**
 * Simple table formatter for CLI output.
 * Formats data as aligned columns with headers.
 */

/**
 * Formats data as a table with column alignment.
 *
 * @param headers - Array of column header names
 * @param rows - Array of rows, each row is an array of cell values
 * @returns Formatted table string
 */
export function formatTable(headers: string[], rows: string[][]): string {
  if (headers.length === 0) {
    return "";
  }

  // Calculate column widths (max of header and all rows)
  const widths = headers.map((h, i) => {
    const headerWidth = h.length;
    const maxRowWidth = rows.reduce(
      (max, row) => Math.max(max, row[i]?.toString().length ?? 0),
      0
    );
    return Math.max(headerWidth, maxRowWidth);
  });

  // Format header row
  const headerRow = headers
    .map((h, i) => h.padEnd(widths[i]))
    .join("  ");

  // Format separator (dashes under each header)
  const separator = widths.map((w) => "-".repeat(w)).join("  ");

  // Format data rows
  const dataRows = rows.map((row) =>
    row.map((cell, i) => (cell?.toString() ?? "").padEnd(widths[i])).join("  ")
  );

  return [headerRow, separator, ...dataRows].join("\n");
}

/**
 * Formats a single record as key-value pairs.
 *
 * @param record - Object with key-value pairs
 * @returns Formatted string with each key-value on a line
 */
export function formatRecord(record: Record<string, unknown>): string {
  const entries = Object.entries(record);
  const maxKeyWidth = Math.max(...entries.map(([k]) => k.length));

  return entries
    .map(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyWidth);
      return `${paddedKey}  ${value ?? ""}`;
    })
    .join("\n");
}
