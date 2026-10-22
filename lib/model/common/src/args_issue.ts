import { isString } from "es-toolkit";

/**
 * How much a {@link ArgsIssue} weighs: an error blocks the block's Run, or its staging, a warning
 * does not.
 */
export type ArgsIssueSeverity = "error" | "warning";

/**
 * One issue a block's `argsIssues()` or `prerunArgsIssues()` found: something that blocks its Run or
 * its staging, or only worth a word.
 */
export type ArgsIssue = {
  readonly severity: ArgsIssueSeverity;
  readonly message: string;
};

/**
 * Reads one {@link ArgsIssue} from a value of unknown origin.
 *
 * Any severity other than `"warning"` is read as `"error"`: an issue whose weight cannot be
 * told keeps the block from running rather than letting it run on a misread finding.
 *
 * @throws when `value` is not an object carrying a string `message`
 */
export function parseArgsIssue(value: unknown): ArgsIssue {
  if (typeof value !== "object" || value === null) {
    throw new Error(`An args issue must be an object, got ${describe(value)}`);
  }
  const message = "message" in value ? value.message : undefined;
  if (!isString(message)) {
    throw new Error(`An args issue must carry a string message, got ${describe(message)}`);
  }
  const severity = "severity" in value && value.severity === "warning" ? "warning" : "error";
  return { severity, message };
}

/**
 * Reads a list of {@link ArgsIssue}s from a value of unknown origin, each entry as
 * {@link parseArgsIssue} reads it.
 *
 * @throws when `value` is not an array, or one of its entries is not an issue
 */
export function parseArgsIssues(value: unknown): ArgsIssue[] {
  if (!Array.isArray(value)) {
    throw new Error(`Args issues must be an array, got ${describe(value)}`);
  }
  return value.map(parseArgsIssue);
}

// Internals

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}
