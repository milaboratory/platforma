import { createHash } from "node:crypto";
import { isPlainObject, isString } from "es-toolkit";
import { hasArgsErrors, parseArgsIssues, type ArgsIssue } from "@milaboratories/pl-model-common";
import type { BlockConfig } from "@platforma-sdk/model";
import type { ProjectField } from "./project_model";

/**
 * The two kinds of args a block derives from its storage: `args` — the args of a run; `prerun` —
 * the args of a prerun, which renders staging.
 */
export type ArgsChannel = "args" | "prerun";

/**
 * Project fields of one args channel:
 * - `current` — the args derived from the current storage, ready to be used;
 * - `draft` — the args derived from the current storage that validation found errors in;
 * - `issues` — the issues validation found, as an {@link ArgsIssuesRecord};
 * - `lastRun` — the args the channel last ran on: of the last run, or of the current staging.
 */
export type ArgsChannelFields = {
  current: ProjectField["fieldName"];
  draft: ProjectField["fieldName"];
  issues: ProjectField["fieldName"];
  lastRun: ProjectField["fieldName"];
};

export const ArgsChannelFields: Record<ArgsChannel, ArgsChannelFields> = {
  args: {
    current: "currentArgs",
    draft: "currentDraftArgs",
    issues: "currentArgsIssues",
    lastRun: "prodArgs",
  },
  prerun: {
    current: "currentPrerunArgs",
    draft: "currentDraftPrerunArgs",
    issues: "currentPrerunArgsIssues",
    lastRun: "stagingArgs",
  },
};

/**
 * Args of one channel a block derived from its storage:
 * - `ready` — `value` is ready to be used; `warnings` are the issues its validation reported;
 * - `notReady` — there are no args, and no reason given for it: the block derived `undefined`,
 *   or, for the prerun of a block without prerun args of its own, its args are not ready and
 *   report why themselves;
 * - `blocked` — `issues` name at least one error that holds the args back; `draft` is the args
 *   validation found them in, `undefined` when deriving them threw;
 * - `failed` — the model could not be run at all.
 */
export type DerivedArgs =
  | { type: "ready"; value: unknown; warnings: ArgsIssue[] }
  | { type: "notReady" }
  | { type: "blocked"; issues: ArgsIssue[]; draft: unknown }
  | { type: "failed"; error: Error };

/**
 * Reads what a block's model returned from deriving the args of `channel`. A model built with an
 * older SDK returns only `{ error }` or `{ value }`: its error becomes the one issue, with the
 * prefix the SDK put before the thrown message cut off. Issues are read again here whatever SDK
 * sent them, so an issue of unknown severity is an error, and a result that holds args back
 * always names an error.
 */
export function parseDerivedArgs(raw: unknown, channel: ArgsChannel): DerivedArgs {
  if (!isPlainObject(raw)) {
    return { type: "failed", error: new Error(`Malformed args derivation result: ${typeof raw}`) };
  }
  const { type, error, value, issues, draft } = raw;

  switch (type) {
    case "ready": {
      const found = parseArgsIssues(issues) ?? [];
      if (value === undefined) return { type: "notReady" };
      if (hasArgsErrors(found)) return { type: "blocked", issues: found, draft: value };
      return { type: "ready", value, warnings: found };
    }
    case "notReady":
      return { type: "notReady" };
    case "blocked":
      return {
        type: "blocked",
        issues: withError(parseArgsIssues(issues) ?? [], errorText(error, channel)),
        draft,
      };
  }

  if (isString(error)) {
    if (channel === "prerun" && error.startsWith(FallbackThrewPrefix)) return { type: "notReady" };
    return { type: "blocked", issues: [errorIssue(errorText(error, channel))], draft: undefined };
  }
  if (value === undefined) return { type: "notReady" };
  return { type: "ready", value, warnings: [] };
}

/**
 * What the `currentArgsIssues` and `currentPrerunArgsIssues` project fields hold: the issues of
 * one channel, with the fingerprints of the block storage and of the block model they were found
 * for. A middle layer that does not know these fields can change the storage, or update the block
 * to another model, and leave them behind; the fingerprints tell such issues from the ones of the
 * storage and the model the block holds now.
 */
export type ArgsIssuesRecord = ArgsIssuesSource & { issues: ArgsIssue[] };

/** Fingerprints of the block storage and of the block model issues were found for. */
export type ArgsIssuesSource = { storageHash: string; modelHash: string };

/** Fingerprint of block storage, over its uncompressed JSON text. */
export function storageFingerprint(storageJson: string): string {
  return sha256(storageJson);
}

/** Fingerprint of a block model, over its code bundle: the code that derives and validates args. */
export function modelFingerprint(config: Pick<BlockConfig, "code">): string {
  return sha256(config.code?.content ?? "");
}

/** The record of a project issues field, `undefined` when it is not one. */
export function parseArgsIssuesRecord(raw: unknown): ArgsIssuesRecord | undefined {
  if (!isPlainObject(raw) || !isString(raw.storageHash) || !isString(raw.modelHash)) {
    return undefined;
  }
  const issues = parseArgsIssues(raw.issues);
  if (issues === undefined) return undefined;
  return { storageHash: raw.storageHash, modelHash: raw.modelHash, issues };
}

/**
 * Issues of a record that were found for `source`, the storage and the model the block holds
 * now; none when the record is of other storage or another model, or is not a record at all.
 */
export function issuesFoundFor(raw: unknown, source: ArgsIssuesSource | undefined): ArgsIssue[] {
  const record = parseArgsIssuesRecord(raw);
  if (record === undefined || source === undefined) return [];
  if (record.storageHash !== source.storageHash || record.modelHash !== source.modelHash) {
    return [];
  }
  return record.issues;
}

// Internals

const ThrewPrefixes: Record<ArgsChannel, string> = {
  args: "args() threw: ",
  prerun: "prerunArgs() threw: ",
};

/**
 * What an older SDK reports when a block without prerun args of its own derived its prerun from
 * its args, and they threw.
 */
const FallbackThrewPrefix = "args() threw (fallback): ";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function errorText(error: unknown, channel: ArgsChannel): string {
  if (!isString(error) || error === "") return "Args are invalid";
  const prefix = ThrewPrefixes[channel];
  return error.startsWith(prefix) ? error.slice(prefix.length) : error;
}

function errorIssue(message: string): ArgsIssue {
  return { severity: "error", message };
}

function withError(issues: ArgsIssue[], fallbackMessage: string): ArgsIssue[] {
  return hasArgsErrors(issues) ? issues : [errorIssue(fallbackMessage), ...issues];
}
