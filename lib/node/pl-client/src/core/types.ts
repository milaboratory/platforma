/* eslint-disable eslint-js/no-restricted-syntax -- this file is the canonical place to construct SignedResourceId values; outside callers must use asSignedResourceId(). */

import type { Branded } from "@milaboratories/pl-model-common";
import { cachedDeserialize, notEmpty } from "@milaboratories/ts-helpers";

/** Null resource id */
export type NullResourceId = Branded<bigint, "null", "__resource_id__">;

/** Global resource id */
export type GlobalResourceId = Branded<bigint, "global", "__resource_id__">;

/** Local resource id */
export type LocalResourceId = Branded<bigint, "local", "__resource_id__">;

/** Any non-null resource id */
export type AnyResourceId = GlobalResourceId | LocalResourceId;

/** All possible resource flavours */
export type OptionalAnyResourceId = NullResourceId | GlobalResourceId | LocalResourceId;

export const NullResourceId = 0n as NullResourceId;

function isNullResourceId(resourceId: bigint | string): resourceId is NullResourceId {
  return resourceId === NullResourceId;
}

export function isAnyResourceId(resourceId: bigint): resourceId is AnyResourceId {
  return resourceId !== 0n;
}

// see local / global resource logic below...

export type ResourceKind = "Structural" | "Value";

export type FieldType = "Input" | "Output" | "Service" | "OTW" | "Dynamic" | "MTW";

export type FutureFieldType = "Output" | "Input" | "Service";

export type FieldStatus = "Empty" | "Assigned" | "Resolved";

export interface ResourceType {
  readonly name: string;
  readonly version: string;
}

export function resourceType(name: string, version: string): ResourceType {
  return { name, version };
}

export function resourceTypeToString(rt: ResourceType): string {
  return `${rt.name}:${rt.version}`;
}

export function parseResourceType(str: string): ResourceType {
  const [name, version] = str.split(":");
  return { name, version };
}

export function resourceTypesEqual(type1: ResourceType, type2: ResourceType): boolean {
  return type1.name === type2.name && type1.version === type2.version;
}

/** Color proof used for resource creation requests (alias for ResourceSignature). */
export type ColorProof = ResourceSignature;

/** Readonly fields here marks properties of resource that can't change according to pl's state machine. */
export type BasicResourceData = {
  readonly id: SignedResourceId;
  readonly originalResourceId: OptionalSignedResourceId;

  readonly kind: ResourceKind;
  readonly type: ResourceType;

  readonly data?: Uint8Array;

  readonly error: OptionalSignedResourceId;

  readonly inputsLocked: boolean;
  readonly outputsLocked: boolean;
  readonly resourceReady: boolean;

  /** This value is derived from resource state by the server and can be used as
   * a robust criteria to determine resource is in final state. */
  readonly final: boolean;
};

export function extractBasicResourceData(rd: ResourceData): BasicResourceData {
  const {
    id,
    originalResourceId,
    kind,
    type,
    data,
    error,
    inputsLocked,
    outputsLocked,
    resourceReady,
    final,
  } = rd;
  return {
    id,
    originalResourceId,
    kind,
    type,
    data,
    error,
    inputsLocked,
    outputsLocked,
    resourceReady,
    final,
  };
}

export const jsonToData = (data: unknown) => Buffer.from(JSON.stringify(data));

export const resDataToJson = (res: ResourceData) => cachedDeserialize(notEmpty(res.data));

export type ResourceData = BasicResourceData & {
  readonly fields: FieldData[];
};

export function getField(r: ResourceData, name: string): FieldData {
  return notEmpty(r.fields.find((f) => f.name === name));
}

export type FieldData = {
  readonly name: string;
  readonly type: FieldType;
  readonly status: FieldStatus;
  readonly value: OptionalSignedResourceId;
  readonly error: OptionalSignedResourceId;

  /** True if value the fields points to is in final state. */
  readonly valueIsFinal: boolean;
};

//
// Local / Global ResourceId arithmetics
//

// Note: txId and other numerical values are made numbers but not bigint intentionally,
//       after implementing security model based on signed resource ids this will make
//       much more sense

const ResourceIdRootMask = 1n << 63n;
const ResourceIdLocalMask = 1n << 62n;
const NoFlagsIdMask = 0x3fffffffffffffffn;
const LocalResourceIdTxIdOffset = 24n;
export const MaxLocalId = 0xffffff;
export const MaxTxId = 0xffffffff;
/** Mask valid after applying shift */
const TxIdMask = BigInt(MaxTxId);
const LocalIdMask = BigInt(MaxLocalId);

// /** Basically removes embedded tx id */
// const LocalIdCleanMask = 0xFF00000000FFFFFFn;

export function isRootResourceId(id: bigint) {
  return (id & ResourceIdRootMask) !== 0n;
}

export function isLocalResourceId(id: bigint | string): id is LocalResourceId {
  if (typeof id === "string") {
    return false;
  }

  return (id & ResourceIdLocalMask) !== 0n;
}

export function createLocalResourceId(
  isRoot: boolean,
  localCounterValue: number,
  localTxId: number,
): LocalResourceId {
  if (
    localCounterValue > MaxLocalId ||
    localTxId > MaxTxId ||
    localCounterValue < 0 ||
    localTxId <= 0
  )
    throw Error("wrong local id or tx id");
  return ((isRoot ? ResourceIdRootMask : 0n) |
    ResourceIdLocalMask |
    BigInt(localCounterValue) |
    (BigInt(localTxId) << LocalResourceIdTxIdOffset)) as LocalResourceId;
}

export function createGlobalResourceId(isRoot: boolean, unmaskedId: bigint): GlobalResourceId {
  return ((isRoot ? ResourceIdRootMask : 0n) | unmaskedId) as GlobalResourceId;
}

export function extractTxId(localResourceId: LocalResourceId): number {
  return Number((localResourceId >> LocalResourceIdTxIdOffset) & TxIdMask);
}

export function checkLocalityOfResourceId(resourceId: AnyResourceId, expectedTxId: number): void {
  if (!isLocalResourceId(resourceId)) return;
  if (extractTxId(resourceId) !== expectedTxId)
    throw Error(
      "local id from another transaction, globalize id before leaking it from the transaction",
    );
}

export function resourceIdToString(
  resourceId: OptionalAnyResourceId | OptionalSignedResourceId,
): string {
  if (isSignedResourceId(resourceId)) {
    // Strip signature
    resourceId = anyResourceIdToBigint(resourceId) as GlobalResourceId;
  }

  if (isNullSignedResourceId(resourceId)) return "XX:0x0";
  if (isNullResourceId(resourceId)) return "XX:0x0";

  if (isLocalResourceId(resourceId))
    return (
      (isRootResourceId(resourceId) ? "R" : "N") +
      "L:0x" +
      (LocalIdMask & resourceId).toString(16) +
      "[0x" +
      extractTxId(resourceId).toString(16) +
      "]"
    );
  else
    return (
      (isRootResourceId(resourceId) ? "R" : "N") +
      "G:0x" +
      (NoFlagsIdMask & resourceId).toString(16)
    );
}

const resourceIdRegexp =
  /^(?:(?<xx>XX)|(?<rn>[XRN])(?<lg>[XLG])):0x(?<rid>[0-9a-fA-F]+)(?:\[0x(?<txid>[0-9a-fA-F]+)])?$/;

export function resourceIdFromString(str: string): OptionalAnyResourceId | undefined {
  const match = str.match(resourceIdRegexp);
  if (match === null) return undefined;
  const { xx, rn, lg, rid, txid } = match.groups!;
  if (xx) return NullResourceId;
  if (lg === "L")
    return createLocalResourceId(rn === "R", Number.parseInt(rid, 16), Number.parseInt(txid, 16));
  else return createGlobalResourceId(rn === "R", BigInt("0x" + rid));
}

export function anyResourceIdToBigint(resourceId: bigint | SignedResourceId): bigint {
  if (typeof resourceId !== "string") {
    return resourceId;
  }

  const parsed = parseSignedResourceId(resourceId);
  return parsed.globalId as bigint;
}

export function stringifyWithResourceId(object: unknown): string {
  return JSON.stringify(object, (key, value) => {
    if (typeof value === "bigint") return resourceIdToString(value as OptionalAnyResourceId);
    if (isSignedResourceId(value)) return resourceIdToString(value);
    return value;
  });
}

/** Opaque authorization signature attached to a resource. */
export type ResourceSignature = Branded<Uint8Array, "ResourceSignature">;

/**
 * Signed resource id is "<global ID>|<resource signature hex>", encoded as string
 * (e.g. "NG:0x123EC|1234567890abcdef")
 */
export type SignedResourceId = Branded<string, "signed", "__signed_resource_id__">;

export type NullSignedResourceId = Branded<string, "null", "__signed_resource_id__">;

export const NullSignedResourceId = "" as NullSignedResourceId;

/** Nullable signed resource ID */
export type OptionalSignedResourceId = NullSignedResourceId | SignedResourceId;

export function isNullSignedResourceId(
  resourceId: bigint | string,
): resourceId is NullSignedResourceId {
  return resourceId === NullSignedResourceId;
}

export function isNotNullSignedResourceId(
  resourceId: OptionalSignedResourceId,
): resourceId is SignedResourceId {
  return resourceId !== NullSignedResourceId;
}

export function ensureSignedResourceIdNotNull(
  resourceId: OptionalSignedResourceId,
): SignedResourceId {
  if (!isNotNullSignedResourceId(resourceId)) throw new Error("null resource id");
  return resourceId;
}

export function isSignedResourceId(resourceId: bigint | string): resourceId is SignedResourceId {
  return typeof resourceId === "string" && resourceId.includes("|");
}

/** Validate a string as a SignedResourceId and return it with the branded type.
 *  Requires the format "<globalId>|<signatureHex>" with a non-empty signature. */
export function asSignedResourceId(str: string): SignedResourceId {
  const pipeIdx = str.indexOf("|");
  if (pipeIdx < 0) throw new Error(`Not a signed resource id (no '|' separator): ${str}`);
  if (pipeIdx === 0) throw new Error(`Signed resource id has empty globalId: ${str}`);
  if (pipeIdx === str.length - 1) throw new Error(`Signed resource id has empty signature: ${str}`);
  return str as SignedResourceId; // lint-allow-cast
}

/** Encode resource signature to base64url for embedding in URL-based handles. */
export function signatureToBase64Url(sig?: ResourceSignature): string {
  return sig && sig.length > 0 ? Buffer.from(sig).toString("base64url") : "";
}

/** Cast raw bytes to a branded ResourceSignature, returning undefined for empty/missing input. */
export function toResourceSignature(raw?: Uint8Array): ResourceSignature {
  return raw && raw.length > 0
    ? (raw as ResourceSignature)
    : (new Uint8Array(0) as ResourceSignature);
}

/** Decode base64url-encoded string back to a branded ResourceSignature. */
export function base64UrlToSignature(str: string): ResourceSignature {
  return toResourceSignature(Buffer.from(str, "base64url"))!;
}

/** Converts bigint global resource id and signature to a SignedResourceId string.
 *  Format: "<globalIdString>|<signatureHex>" */
export function createSignedResourceId(
  globalId: bigint,
  signature?: ResourceSignature,
): SignedResourceId {
  if (isLocalResourceId(globalId))
    throw new Error(`Local resource id: ${resourceIdToString(globalId)}`);
  if (isNullResourceId(globalId)) throw new Error(`Null resource id.`);

  const sigHex = signature ? Buffer.from(signature).toString("hex") : "";
  return `${String(globalId)}|${sigHex}` as SignedResourceId; // lint-allow-cast
}

export function parseSignedResourceId(resourceId: SignedResourceId): {
  globalId: GlobalResourceId;
  signature: ResourceSignature;
} {
  if (typeof resourceId !== "string") {
    throw new Error(`Not a signed resource id: ${resourceId}`);
  }

  const pipeIdx = resourceId.indexOf("|");
  if (pipeIdx < 0) throw new Error(`Malformed signed resource id (no '|'): ${resourceId}`);

  const globalIdStr = resourceId.substring(0, pipeIdx);
  const signatureHex = resourceId.substring(pipeIdx + 1);

  const globalId = BigInt(globalIdStr);
  if (isNullSignedResourceId(globalId) || isLocalResourceId(globalId))
    throw new Error(`Invalid global id portion in signed resource id: ${globalIdStr}`);

  const signature: ResourceSignature = (
    signatureHex.length > 0 ? Buffer.from(signatureHex, "hex") : new Uint8Array(0)
  ) as ResourceSignature;

  return { globalId: globalId as GlobalResourceId, signature };
}
