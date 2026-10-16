import { isString } from "es-toolkit";

/**
 * How much an issue holds back the args it was found in:
 * - `error` — the args are not ready: a block does not run on them, and prerun is skipped;
 * - `warning` — the args are ready and are used; the issue is only reported.
 */
export type ArgsIssueSeverity = "error" | "warning";

/** A problem a block's validation found in the args it derived from its data. */
export type ArgsIssue = {
  severity: ArgsIssueSeverity;
  /** Text shown to the user as is. */
  message: string;
};

/**
 * Issues read from a value of unknown origin: what a block's validation returned, or what a block
 * built with any SDK version sent across the model VM boundary. `undefined` when the value is not
 * a list. Every item of a list yields one issue, and an item is a warning only when it says so
 * exactly: a severity that is missing or unknown counts as an error, so an issue nobody can
 * classify still holds the args back. An item without a text message gets a message describing
 * it.
 */
export function parseArgsIssues(raw: unknown): ArgsIssue[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map(parseArgsIssue);
}

/** Whether any of the issues holds the args back. */
export function hasArgsErrors(issues: readonly ArgsIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

// Internals

function parseArgsIssue(item: unknown): ArgsIssue {
  if (isString(item)) return { severity: "error", message: item };
  if (typeof item !== "object" || item === null) {
    return { severity: "error", message: `Malformed issue: ${describe(item)}` };
  }
  const { severity, message } = item as { severity?: unknown; message?: unknown };
  return {
    severity: severity === "warning" ? "warning" : "error",
    message: isString(message) ? message : `Malformed issue: ${describe(item)}`,
  };
}

function describe(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
