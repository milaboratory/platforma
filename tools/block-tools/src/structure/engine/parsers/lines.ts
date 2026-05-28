// .gitignore-style line list parser/serialiser.
//
// `parseLines` keeps the file verbatim as an array of lines (one per
// "\n"). `serializeLines` joins them with "\n" and guarantees a trailing
// newline. `normaliseLine` strips comments and surrounding whitespace —
// used by the `ensureGitignoreEntries` family to compare an existing
// line to a required entry without being fooled by inline `#` comments
// or extra indentation.

export function parseLines(raw: string): string[] {
  // Drop the synthetic empty entry caused by a trailing newline so a
  // serialise-then-parse round-trip is stable.
  const lines = raw.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function serializeLines(lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/** Strip leading/trailing whitespace and trailing inline `# ...` comments.
 *  Returns empty string for blank / comment-only lines. */
export function normaliseLine(line: string): string {
  const noComment = line.replace(/(^|\s)#.*$/, "$1");
  return noComment.trim();
}

/** True if `line` (after normalisation) equals `entry` (after trim). */
export function lineEqualsEntry(line: string, entry: string): boolean {
  const n = normaliseLine(line);
  if (n === "") return false;
  return n === entry.trim();
}

/** True if any line in `lines` normalises to `entry`. */
export function containsEntry(lines: readonly string[], entry: string): boolean {
  for (const line of lines) {
    if (lineEqualsEntry(line, entry)) return true;
  }
  return false;
}
