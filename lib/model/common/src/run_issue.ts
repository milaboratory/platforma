import { isString } from "es-toolkit";

/**
 * How much a {@link RunIssue} weighs: an error blocks the block's Run, or its staging, a warning
 * does not.
 */
export type RunIssueSeverity = "error" | "warning";

/**
 * One issue a block's `runIssues()` or `prerunIssues()` found: something that blocks its Run or
 * its staging, or only worth a word.
 */
export type RunIssue = {
  readonly severity: RunIssueSeverity;
  readonly message: string;
};

/**
 * Reads one {@link RunIssue} from a value of unknown origin.
 *
 * Any severity other than `"warning"` is read as `"error"`: an issue whose weight cannot be
 * told keeps the block from running rather than letting it run on a misread finding.
 *
 * @throws when `value` is not an object carrying a string `message`
 */
export function parseRunIssue(value: unknown): RunIssue {
  if (typeof value !== "object" || value === null) {
    throw new Error(`A run issue must be an object, got ${describe(value)}`);
  }
  const message = "message" in value ? value.message : undefined;
  if (!isString(message)) {
    throw new Error(`A run issue must carry a string message, got ${describe(message)}`);
  }
  const severity = "severity" in value && value.severity === "warning" ? "warning" : "error";
  return { severity, message };
}

/**
 * Reads a list of {@link RunIssue}s from a value of unknown origin, each entry as
 * {@link parseRunIssue} reads it.
 *
 * @throws when `value` is not an array, or one of its entries is not an issue
 */
export function parseRunIssues(value: unknown): RunIssue[] {
  if (!Array.isArray(value)) {
    throw new Error(`Run issues must be an array, got ${describe(value)}`);
  }
  return value.map(parseRunIssue);
}

// Internals

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}
