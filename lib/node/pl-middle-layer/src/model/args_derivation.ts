import { parseRunIssues, type RunIssue } from "@milaboratories/pl-model-common";
import { cachedDeserialize, canonicalJsonBytes } from "@milaboratories/ts-helpers";
import { isString } from "es-toolkit";
import { createHash } from "node:crypto";
import { BLOCK_STORAGE_FACADE_VERSION } from "@platforma-sdk/model";

/**
 * What the args derivation of a block with model API version 2 made of the block's storage.
 *
 * - `runnable`: the block has args and may run with them.
 * - `blocked`: the block has args, but its `runIssues()` found errors in them, so it must not run.
 *   `errors` is never empty.
 * - `absent`: the block has no args, because `args()` threw or returned nothing.
 */
export type DerivedArgs =
  | { readonly type: "runnable"; readonly args: unknown }
  | { readonly type: "blocked"; readonly args: unknown; readonly errors: readonly RunIssue[] }
  | { readonly type: "absent"; readonly error: Error };

/**
 * What a block's `inputsValid` field holds: the run errors of the block's current args, and the
 * fingerprint of the args they were found in. Every args derivation that produces args writes
 * it, with no errors when the block may run.
 *
 * A middle layer that predates run issues never writes or deletes the field, so after it edits
 * the block, the field can be missing or outlive the args it was computed for. The fingerprint
 * tells such a stale field apart: it no longer matches the current args, so whether they let the
 * block run is unknown until they are derived again.
 */
export type RunErrorsRecord = {
  /** {@link argsFingerprint} of the current args the errors were found in. */
  readonly argsFingerprint: string;
  /** The errors; empty when the block may run with the args. */
  readonly errors: readonly RunIssue[];
};

/**
 * What is known of the run errors of a block's current args:
 *
 * - `known`: `errors` are the errors found in the current args; the block may run with them when
 *   there are none.
 * - `unknown`: the block has current args, but its `inputsValid` field is missing, cannot be
 *   read, or was written for other args. The block must not run until its args are derived
 *   again.
 */
export type RunErrorsState =
  | { readonly type: "known"; readonly errors: readonly RunIssue[] }
  | { readonly type: "unknown" };

/**
 * How a block's `currentArgs` field must change to hold the args a derivation produced: `write`
 * carries them as canonical JSON.
 */
export type CurrentArgsChange =
  | { readonly type: "keep" }
  | { readonly type: "write"; readonly data: Uint8Array }
  | { readonly type: "delete" };

/** How a block's `inputsValid` field must change to hold what an args derivation found. */
export type RunErrorsFieldChange =
  | { readonly type: "keep" }
  | { readonly type: "write"; readonly data: Uint8Array }
  | { readonly type: "delete" };

/**
 * Reads the result of the model's `__pl_args_derive` callback.
 *
 * A model built before run issues returns `{ value }` for args and `{ error }` for none; both
 * read as they did then. A newer model adds the run issues, and returns `{ error, args, issues }`
 * when its `runIssues()` found errors. Args that are `undefined` are no args, whatever
 * `runIssues()` said.
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
    return { type: "blocked", args, errors: runErrorsOf(issues, error) };
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
 * The field holds a {@link RunErrorsRecord} as canonical JSON, and exists while the block has
 * args: with the errors its `runIssues()` found in them, and with none when it found none. A
 * field already holding the same record is kept as it is, so that readers of the project are not
 * woken by a write that changes nothing.
 */
export function runErrorsFieldChange(
  current: { readonly value?: Uint8Array } | undefined,
  derived: DerivedArgs,
): RunErrorsFieldChange {
  if (derived.type === "absent")
    return current === undefined ? { type: "keep" } : { type: "delete" };
  const record: RunErrorsRecord = {
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
 * What a block's `currentArgs` field must become after its args are derived again, given the
 * args it holds now. Args equal to the current ones, whatever their key order, are kept as they
 * are, so that readers of the project are not woken by a write that changes nothing.
 *
 * @param currentArgs - The block's current args as decoded from its `currentArgs` field;
 *   `undefined` when it has none
 */
export function currentArgsChange(currentArgs: unknown, derived: DerivedArgs): CurrentArgsChange {
  const args = derivedArgsValue(derived);
  if (args === undefined) return currentArgs === undefined ? { type: "keep" } : { type: "delete" };
  if (currentArgs !== undefined && argsFingerprint(args) === argsFingerprint(currentArgs)) {
    return { type: "keep" };
  }
  return { type: "write", data: canonicalJsonBytes(args) };
}

/**
 * What a block's `inputsValid` field, as {@link runErrorsFieldChange} writes it, tells of the run
 * errors of the block's current args.
 *
 * This middle layer writes the field with every args it derives, so a field that is missing,
 * cannot be read, or was written for other args means the args were written by a middle layer
 * that does not know the field: the errors are `unknown`. No current args hold no errors: without
 * args the block may not run anyway.
 *
 * @param data - Content of the field; `undefined` when there is none, or while it is not loaded
 * @param currentArgs - The block's current args as decoded from its `currentArgs` field;
 *   `undefined` when the block has none
 */
export function readRunErrorsField(
  data: Uint8Array | undefined,
  currentArgs: unknown,
): RunErrorsState {
  if (currentArgs === undefined) return { type: "known", errors: [] };
  if (data === undefined) return { type: "unknown" };
  let record: RunErrorsRecord;
  try {
    record = parseRunErrorsRecord(cachedDeserialize(data));
  } catch {
    return { type: "unknown" };
  }
  if (record.argsFingerprint !== argsFingerprint(currentArgs)) return { type: "unknown" };
  return { type: "known", errors: record.errors };
}

/**
 * The run errors of a block's current args, read from its `inputsValid` field as
 * {@link readRunErrorsField} reads it.
 *
 * Only a block with model API version 2 has run errors. An earlier model tells whether the block
 * may run by itself, and a field left over from a later model version does not apply to it: such
 * a block has none.
 */
export function runErrorsOfBlock(block: {
  /** Model API version of the block's current block pack. */
  readonly modelAPIVersion: number | undefined;
  /** The block's `inputsValid` field; `undefined` when there is none. */
  readonly inputsValid: { readonly value?: Uint8Array } | undefined;
  /** The block's current args; `undefined` when it has none. */
  readonly currentArgs: unknown;
}): RunErrorsState {
  const { modelAPIVersion, inputsValid, currentArgs } = block;
  if (modelAPIVersion !== BLOCK_STORAGE_FACADE_VERSION) return { type: "known", errors: [] };
  return readRunErrorsField(inputsValid?.value, currentArgs);
}

/** Whether the block may run as far as its run errors go: they are known, and there are none. */
export function runErrorsAllowRun(state: RunErrorsState): boolean {
  return state.type === "known" && state.errors.length === 0;
}

/**
 * How a block's fields must change so that the run errors of its current args are known again.
 *
 * - `none`: they are known already, or the block has no storage to derive args from.
 * - `rederived`: the args were derived again from the block's storage; how its `currentArgs` and
 *   `inputsValid` fields must change to hold them and their run errors.
 */
export type ArgsRepair =
  | { readonly type: "none" }
  | {
      readonly type: "rederived";
      readonly currentArgs: CurrentArgsChange;
      readonly inputsValid: RunErrorsFieldChange;
    };

/**
 * Derives the args of a block again from its storage when the run errors of its current args are
 * unknown: a middle layer that does not record them with every args wrote the args, or the
 * project was saved before the record existed. The same storage always derives the same args, and
 * fields that already hold what the derivation gives are kept, so a repaired block is repaired
 * once and a block in order is never touched.
 */
export function argsRepair(
  block: {
    readonly runErrors: RunErrorsState;
    /** The block's current args; `undefined` when it has none. */
    readonly currentArgs: unknown;
    /** The block's `inputsValid` field; `undefined` when there is none. */
    readonly inputsValid: { readonly value?: Uint8Array } | undefined;
    /** The block's storage as JSON; `undefined` when it has none. */
    readonly storageJson: string | undefined;
  },
  deriveArgs: (storageJson: string) => DerivedArgs,
): ArgsRepair {
  const { runErrors, currentArgs, inputsValid, storageJson } = block;
  if (runErrors.type === "known" || storageJson === undefined) return { type: "none" };
  const derived = deriveArgs(storageJson);
  return {
    type: "rederived",
    currentArgs: currentArgsChange(currentArgs, derived),
    inputsValid: runErrorsFieldChange(inputsValid, derived),
  };
}

// Internals

/**
 * The errors among the run issues of a derivation whose `runIssues()` found errors. Issues that
 * cannot be read, or that hold no error, give way to `error`, the joined messages the model
 * reported.
 */
function runErrorsOf(issues: unknown, error: string): readonly RunIssue[] {
  try {
    const errors = parseRunIssues(issues).filter(isError);
    if (errors.length > 0) return errors;
  } catch {
    // An older or broken model: `error` alone tells why the block must not run.
  }
  return [{ severity: "error", message: error }];
}

/**
 * Reads a {@link RunErrorsRecord} from decoded field content. Issues other than errors are
 * dropped.
 *
 * @throws when `value` is not an object carrying a string fingerprint and a list of issues
 */
function parseRunErrorsRecord(value: unknown): RunErrorsRecord {
  if (typeof value !== "object" || value === null) {
    throw new Error("Run errors record must be an object");
  }
  const fingerprint = "argsFingerprint" in value ? value.argsFingerprint : undefined;
  if (!isString(fingerprint)) throw new Error("Run errors record must carry a fingerprint");
  const errors = parseRunIssues("errors" in value ? value.errors : undefined).filter(isError);
  return { argsFingerprint: fingerprint, errors };
}

function isError(issue: RunIssue): boolean {
  return issue.severity === "error";
}
