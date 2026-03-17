export type OutputFormat = "text" | "json";

/** Outputs data as formatted JSON to stdout. */
export function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/** Formats a table as aligned text columns. */
export function formatTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );

  const sep = colWidths.map((w) => "-".repeat(w)).join("  ");
  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join("  ");
  const dataLines = rows.map((row) =>
    row.map((cell, i) => (cell ?? "").padEnd(colWidths[i])).join("  "),
  );

  return [headerLine, sep, ...dataLines].join("\n");
}

/** Formats a Date as a short human-readable string. */
export function formatDate(d: Date): string {
  if (d.getTime() === 0) return "(unknown)";
  return d
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, "Z");
}
