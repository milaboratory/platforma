import { Pl, type SignedResourceId } from "@milaboratories/pl-client";
import { hasArgsErrors, type ArgsIssue } from "@milaboratories/pl-model-common";
import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { extractConfig } from "@platforma-sdk/model";
import { LRUCache } from "lru-cache";
import type { BlockPackInfo } from "./block_pack";
import {
  ArgsChannelFields,
  issuesFoundFor,
  modelFingerprint,
  storageFingerprint,
  type ArgsChannel,
  type ArgsIssuesSource,
} from "./derived_args";
import { projectFieldName, type ProjectField } from "./project_model";

/**
 * A project field a block's args are read from: a step of the chain of its args — current,
 * draft, last run — or of the chain of its prerun args.
 */
export type ArgsField =
  | "currentArgs"
  | "currentDraftArgs"
  | "prodArgs"
  | "currentPrerunArgs"
  | "currentDraftPrerunArgs"
  | "stagingArgs";

/**
 * The args resource of `blockId` in `field`, `undefined` when the block has none there. A draft
 * is read only while the channel has no current args and the issues next to it were found for
 * the storage and the model the block holds now: a middle layer that does not know drafts can
 * change the storage, or update the block, and leave an older draft behind.
 */
export function readArgsField(
  prj: PlTreeNodeAccessor,
  blockId: string,
  field: ArgsField,
): PlTreeNodeAccessor | undefined {
  const channel = draftChannel(field);
  if (channel !== undefined) {
    const fields = ArgsChannelFields[channel];
    if (readField(prj, blockId, fields.current) !== undefined) return undefined;
    if (!hasArgsErrors(readArgsIssues(prj, blockId, channel))) return undefined;
  }
  return readField(prj, blockId, field);
}

/**
 * Issues validation found in the args of `channel` derived from the storage the block holds now
 * by the model it holds now; none when the block reports none, or reported them for storage it
 * no longer holds or for another model.
 */
export function readArgsIssues(
  prj: PlTreeNodeAccessor,
  blockId: string,
  channel: ArgsChannel,
): ArgsIssue[] {
  const record = readField(prj, blockId, ArgsChannelFields[channel].issues)?.getDataAsJson();
  if (record === undefined) return [];
  return issuesFoundFor(record, readIssuesSource(prj, blockId));
}

// Internals

// Storage and block pack resources never change, so a resource id alone identifies the
// fingerprint of its content.
const storageFingerprintCache = new LRUCache<SignedResourceId, string>({ max: 1024 });
const modelFingerprintCache = new LRUCache<SignedResourceId, string>({ max: 1024 });

function readIssuesSource(prj: PlTreeNodeAccessor, blockId: string): ArgsIssuesSource | undefined {
  const storageHash = readStorageFingerprint(prj, blockId);
  if (storageHash === undefined) return undefined;
  const modelHash = readModelFingerprint(prj, blockId);
  if (modelHash === undefined) return undefined;
  return { storageHash, modelHash };
}

function readStorageFingerprint(prj: PlTreeNodeAccessor, blockId: string): string | undefined {
  const storage = readField(prj, blockId, "blockStorage");
  if (storage === undefined) return undefined;
  const cached = storageFingerprintCache.get(storage.id);
  if (cached !== undefined) return cached;
  const json = storage.getDataAsString();
  if (json === undefined) return undefined;
  const fingerprint = storageFingerprint(json);
  storageFingerprintCache.set(storage.id, fingerprint);
  return fingerprint;
}

function readModelFingerprint(prj: PlTreeNodeAccessor, blockId: string): string | undefined {
  const pack = prj.traverse(
    {
      field: projectFieldName(blockId, "blockPack"),
      assertFieldType: "Dynamic",
      stableIfNotFound: true,
    },
    { field: Pl.HolderRefField, assertFieldType: "Input", stableIfNotFound: true },
  );
  if (pack === undefined) return undefined;
  const cached = modelFingerprintCache.get(pack.id);
  if (cached !== undefined) return cached;
  const info = pack.getDataAsJson<BlockPackInfo>();
  if (info === undefined) return undefined;
  const fingerprint = modelFingerprint(extractConfig(info.config));
  modelFingerprintCache.set(pack.id, fingerprint);
  return fingerprint;
}

function readField(
  prj: PlTreeNodeAccessor,
  blockId: string,
  field: ProjectField["fieldName"],
): PlTreeNodeAccessor | undefined {
  return prj.traverse({
    field: projectFieldName(blockId, field),
    assertFieldType: "Dynamic",
    stableIfNotFound: true,
  });
}

function draftChannel(field: ArgsField): ArgsChannel | undefined {
  if (field === ArgsChannelFields.args.draft) return "args";
  if (field === ArgsChannelFields.prerun.draft) return "prerun";
  return undefined;
}
