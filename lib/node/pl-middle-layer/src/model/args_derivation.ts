import { parseArgsIssues, type ArgsIssue } from "@milaboratories/pl-model-common";
import { cachedDeserialize, canonicalJsonBytes } from "@milaboratories/ts-helpers";
import { isString } from "es-toolkit";
import { createHash } from "node:crypto";
import { BLOCK_STORAGE_FACADE_VERSION } from "@platforma-sdk/model";

/**
 * What the args derivation of a block with model API version 2 made of the block's storage.
 *
 * - `runnable`: the block has args and may run with them.
 * - `blocked`: the block has args, but its `argsIssues()` found errors in them, so it must not run.
 *   `errors` is never empty.
 * - `absent`: the block has no args, because `args()` threw or returned nothing.
 */
export type DerivedArgs =
  | { readonly type: "runnable"; readonly args: unknown }
  | { readonly type: "blocked"; readonly args: unknown; readonly errors: readonly ArgsIssue[] }
  | { readonly type: "absent"; readonly error: Error };

/**
 * What a block's `inputsValid` field holds: the errors found in the block's current args, and the
 * fingerprint of the args they were found in. Every args derivation that produces args writes
 * it, with no errors when the block may run.
 *
 * A middle layer that predates args issues never writes or deletes the field, so after it edits
 * the block, the field can be missing or outlive the args it was computed for. The fingerprint
 * tells such a stale field apart: it no longer matches the current args, and says nothing of them.
 */
export type ArgsErrorsRecord = {
  /** {@link argsFingerprint} of the current args the errors were found in. */
  readonly argsFingerprint: string;
  /** The errors; empty when the block may run with the args. */
  readonly errors: readonly ArgsIssue[];
};

/** How a block's `inputsValid` field must change to hold what an args derivation found. */
export type ArgsErrorsFieldChange =
  | { readonly type: "keep" }
  | { readonly type: "write"; readonly data: Uint8Array }
  | { readonly type: "delete" };

/**
 * Reads the result of the model's `__pl_args_derive` callback.
 *
 * A model built before args issues returns `{ value }` for args and `{ error }` for none; both
 * read as they did then. A newer model adds the args issues, and returns `{ error, args, issues }`
 * when its `argsIssues()` found errors. Args that are `undefined` are no args, whatever
 * `argsIssues()` said.
 *
 * @throws when `value` is not an object, or carries an `error` that is not a string
 */
export function parseArgsDeriveResult(value: unknown): DerivedArgs {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Args derivation returned ${value === null ? "null" : typeof value}`);
  }

  const error = "error" in value ? value.error : undefined;
  if (error !== undefined) {
    if (!isString(error)) throw new Error(`Args derivation error is ${typeof error}, not a string`);
    const args = "args" in value ? value.args : undefined;
    if (args === undefined) return { type: "absent", error: new Error(error) };
    const issues = "issues" in value ? value.issues : undefined;
    return { type: "blocked", args, errors: argsErrorsOf(issues, error) };
  }

  const args = "value" in value ? value.value : undefined;
  if (args === undefined) return { type: "absent", error: new Error("args() returned no args") };
  return { type: "runnable", args };
}

/** The args an args derivation produced; `undefined` when it produced none. */
export function derivedArgsValue(derived: DerivedArgs): unknown {
  return derived.type === "absent" ? undefined : derived.args;
}

/**
 * Identifies a value of a block's current args by its content: the SHA-256 of its canonical JSON,
 * in hex. Args that encode to the same JSON, whatever the key order, share a fingerprint.
 */
export function argsFingerprint(args: unknown): string {
  return createHash("sha256").update(canonicalJsonBytes(args)).digest("hex");
}

/**
 * What a block's `inputsValid` field must become after an args derivation, given the field as it
 * is now.
 *
 * The field holds a {@link ArgsErrorsRecord} as canonical JSON, and exists while the block has
 * args: with the errors its `argsIssues()` found in them, and with none when it found none. A
 * field already holding the same record is kept as it is, so that readers of the project are not
 * woken by a write that changes nothing.
 */
export function argsErrorsFieldChange(
  current: { readonly value?: Uint8Array } | undefined,
  derived: DerivedArgs,
): ArgsErrorsFieldChange {
  if (derived.type === "absent")
    return current === undefined ? { type: "keep" } : { type: "delete" };
  const record: ArgsErrorsRecord = {
    argsFingerprint: argsFingerprint(derived.args),
    errors: derived.type === "blocked" ? derived.errors : [],
  };
  const data = canonicalJsonBytes(record);
  if (current?.value !== undefined && Buffer.compare(current.value, data) === 0) {
    return { type: "keep" };
  }
  return { type: "write", data };
}

/**
 * The errors a block's `inputsValid` field, as {@link argsErrorsFieldChange} writes it, records
 * for the block's current args.
 *
 * A field that is missing, cannot be read, or was written for other args records none: the args
 * were written by a middle layer that does not know the field. Such a middle layer refuses every
 * block whose `argsIssues()` could find errors, so it wrote args only for blocks whose `args()`
 * throws instead, and those args may run, as they always could. No current args hold no errors:
 * without args the block may not run anyway.
 *
 * @param data - Content of the field; `undefined` when there is none, or while it is not loaded
 * @param currentArgs - The block's current args as decoded from its `currentArgs` field;
 *   `undefined` when the block has none
 */
export function readArgsErrorsField(
  data: Uint8Array | undefined,
  currentArgs: unknown,
): readonly ArgsIssue[] {
  if (currentArgs === undefined || data === undefined) return [];
  let record: ArgsErrorsRecord;
  try {
    record = parseArgsErrorsRecord(cachedDeserialize(data));
  } catch {
    return [];
  }
  return record.argsFingerprint === argsFingerprint(currentArgs) ? record.errors : [];
}

/**
 * The errors found in a block's current args, read from its `inputsValid` field as
 * {@link readArgsErrorsField} reads it.
 *
 * Only a block with model API version 2 has args errors. An earlier model tells whether the block
 * may run by itself, and a field left over from a later model version does not apply to it: such
 * a block has none.
 */
export function argsErrorsOfBlock(block: {
  /** Model API version of the block's current block pack. */
  readonly modelAPIVersion: number | undefined;
  /** The block's `inputsValid` field; `undefined` when there is none. */
  readonly inputsValid: { readonly value?: Uint8Array } | undefined;
  /** The block's current args; `undefined` when it has none. */
  readonly currentArgs: unknown;
}): readonly ArgsIssue[] {
  const { modelAPIVersion, inputsValid, currentArgs } = block;
  if (modelAPIVersion !== BLOCK_STORAGE_FACADE_VERSION) return [];
  return readArgsErrorsField(inputsValid?.value, currentArgs);
}

// Internals

/**
 * The errors among the issues of a derivation whose `argsIssues()` found errors. Issues that
 * cannot be read, or that hold no error, give way to `error`, the joined messages the model
 * reported.
 */
function argsErrorsOf(issues: unknown, error: string): readonly ArgsIssue[] {
  try {
    const errors = parseArgsIssues(issues).filter(isError);
    if (errors.length > 0) return errors;
  } catch {
    // An older or broken model: `error` alone tells why the block must not run.
  }
  return [{ severity: "error", message: error }];
}

/**
 * Reads a {@link ArgsErrorsRecord} from decoded field content. Issues other than errors are
 * dropped.
 *
 * @throws when `value` is not an object carrying a string fingerprint and a list of issues
 */
function parseArgsErrorsRecord(value: unknown): ArgsErrorsRecord {
  if (typeof value !== "object" || value === null) {
    throw new Error("Args errors record must be an object");
  }
  const fingerprint = "argsFingerprint" in value ? value.argsFingerprint : undefined;
  if (!isString(fingerprint)) throw new Error("Args errors record must carry a fingerprint");
  const errors = parseArgsIssues("errors" in value ? value.errors : undefined).filter(isError);
  return { argsFingerprint: fingerprint, errors };
}

function isError(issue: ArgsIssue): boolean {
  return issue.severity === "error";
}
