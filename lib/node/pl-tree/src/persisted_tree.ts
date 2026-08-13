/**
 * On-disk format for a tree mirror.
 *
 * Header and trailer are always plain bytes; only the payload is compressed. Every integer
 * is little-endian and fixed-width.
 *
 * ```text
 * +-- header (never compressed) -----------------------------+
 * | u32  magic         0x53544C50  ("PLTS", little-endian)   |
 * | u16  schemaVersion                                       |
 * | u16  flags         bit0 = payload is deflated            |
 * | u16  witnessLen  +  witness bytes (the root's signature) |
 * +-- payload (deflated, or raw if the flag is clear) -------+
 * | u32 rootCount, then u64 globalId per root                |
 * |                                                          |
 * | u32 signatureCount, then per entry:                      |
 * |      u64 globalId                                        |
 * |      u16 sigLen + signature bytes                        |
 * |                                                          |
 * | u32 resourceCount, then per resource:                    |
 * |      u64 own globalId                                    |
 * |      u64 originalResourceId          (0 = none)          |
 * |      u64 error                       (0 = none)          |
 * |      u8  kind index                                      |
 * |      str type.name                                       |
 * |      str type.version                                    |
 * |      u8  flags (hasData, inputsLocked, outputsLocked,    |
 * |                 resourceReady, final)                    |
 * |      [u32 len + data]                only if hasData     |
 * |      u32 fieldCount, then per field:                     |
 * |           str name                                       |
 * |           u8  field type index                           |
 * |           u8  field status index                         |
 * |           u64 value                  (0 = none)          |
 * |           u64 error                  (0 = none)          |
 * |           u8  valueIsFinal                               |
 * |      u32 kvCount, then per entry:                        |
 * |           str key                                        |
 * |           u32 len + value bytes                          |
 * +-- trailer (never compressed) ----------------------------+
 * | u32  payload length, as stored                           |
 * | u32  crc32 of the payload, as stored                     |
 * +----------------------------------------------------------+
 * ```
 *
 * Notes on the encoding:
 *
 * - `str` is a u32 length followed by UTF-8.
 * - A {@link SignedResourceId} is the string `"<decimal globalId>|<signatureHex>"`. Bodies
 *   store only the global id; the signature comes from the side table. Global id 0 stands
 *   for "no reference".
 * - `kind`, field type and field status are stored as indices into {@link KINDS},
 *   {@link FIELD_TYPES} and {@link FIELD_STATUSES}. Those orderings are part of the format:
 *   append only, never reorder.
 * - The payload length in the trailer, not the file size, delimits the payload.
 * - The witness is the root's signature at write time, and is outside the compressed section
 *   so it can be read without inflating the payload ({@link readPersistedTreeHeader}).
 * - Reference counts, resource and data versions, change sources and the derived final state
 *   are not stored. They are rebuilt on restore. The backend's `final` flag is stored, as
 *   part of the body.
 */

import type {
  FieldData,
  FieldStatus,
  FieldType,
  FinalResourceDataPredicate,
  KeyValue,
  OptionalSignedResourceId,
  ResourceKind,
  ResourceSignature,
  SignedResourceId,
} from "@milaboratories/pl-client";
import {
  createSignedResourceId,
  isNotNullSignedResourceId,
  NullSignedResourceId,
  parseSignedResourceId,
  toResourceSignature,
} from "@milaboratories/pl-client";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { deflate, inflate } from "node:zlib";
import { promisify } from "node:util";
import type { ExtendedResourceData } from "./state";
import { PlTreeState } from "./state";

const deflateAsync = promisify(deflate);
const inflateAsync = promisify(inflate);

/** "PLTS", little-endian. Distinguishes our file from anything else that lands in the
 *  snapshot directory, so a foreign file is rejected instead of parsed as garbage. */
const MAGIC = 0x53544c50;

/** Bumped whenever the byte layout below changes in a way an older decoder would
 *  misread. Only an exact match is accepted: the decoder's job here is to recognise a
 *  format it cannot read, not to migrate it. Invalidation on rule changes is the cache
 *  key's job (the middle layer's build stamp), not this number's. */
export const PERSISTED_TREE_SCHEMA_VERSION = 1;

/** Payload is deflated. Absent means the payload is stored as-is, which is what a
 *  periodic write falls back to if compression CPU ever becomes a problem. */
const FLAG_COMPRESSED = 1 << 0;

const HEADER_FIXED_BYTES = 4 /* magic */ + 2 /* schema */ + 2 /* flags */ + 2 /* witness len */;
const TRAILER_BYTES = 4 /* payload length */ + 4 /* checksum */;

/** Enum orderings are part of the on-disk format: append only, never reorder. An index
 *  the decoder does not know is malformed input, which is why decoding is bounds-checked
 *  rather than cast. */
const KINDS: readonly ResourceKind[] = ["Structural", "Value"];
const FIELD_TYPES: readonly FieldType[] = ["Input", "Output", "Service", "OTW", "Dynamic", "MTW"];
const FIELD_STATUSES: readonly FieldStatus[] = ["Empty", "Assigned", "Resolved"];

const RES_HAS_DATA = 1 << 0;
const RES_INPUTS_LOCKED = 1 << 1;
const RES_OUTPUTS_LOCKED = 1 << 2;
const RES_READY = 1 << 3;
const RES_FINAL = 1 << 4;

/** Global id 0 stands for "no reference". A real resource can never have it:
 *  `createSignedResourceId` rejects the null id, so the sentinel is unambiguous. */
const NO_REFERENCE = 0n;

/**
 * A tree mirror as it sits on disk.
 *
 * Every reference inside {@link resources} is stored as a global id, with signatures held
 * apart in a side table that {@link decodePersistedTree} rejoins. That split is what lets a
 * snapshot outlive the signatures it was taken with: the bodies stay valid indefinitely, so
 * a future signature refresh can replace the table and reuse the same corpus.
 */
export type PersistedTree = {
  /** Session witness: the signature bytes of the tree's root at write time.
   *  A resource signature is an HMAC over the id, the session and the colour, so byte
   *  equality against a freshly resolved root signature means every other signature in the
   *  table still addresses something. Inequality means they are all dead. */
  readonly witness: ResourceSignature;
  readonly roots: readonly SignedResourceId[];
  readonly resources: readonly ExtendedResourceData[];
};

/** The part of a snapshot readable without inflating the payload. Kept outside the
 *  compressed section on purpose: a rotated session must be detectable without paying to
 *  decompress ten megabytes that are about to be discarded. */
export type PersistedTreeHeader = {
  readonly schemaVersion: number;
  readonly witness: ResourceSignature;
};

/** Why a snapshot could not be read. Carried rather than thrown, because every one of
 *  these means "open cold" and the caller wants to count which happened. */
export type PersistedTreeReadFailure =
  /** Not our file at all: wrong magic, or too short to hold a header. */
  | "not-a-snapshot"
  /** Written by a different schema version. */
  | "unknown-schema"
  /** File ends early: the length trailer disagrees with the actual size. */
  | "truncated"
  /** Checksum mismatch: the bytes are ours but damaged. */
  | "checksum"
  /** Structurally decodable but internally nonsensical (bad enum index, local id, ...). */
  | "malformed";

export type PersistedTreeReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: PersistedTreeReadFailure };

export type EncodePersistedTreeOps = {
  /** Defaults to true. Turning it off trades roughly a factor of three in file size for
   *  the compression CPU, which is the documented escape hatch for periodic writes. */
  readonly compress?: boolean;
};

//
// Capture and restore
//

/**
 * Captures a live tree's state for persistence. `witness` is the signature of the root as
 * currently held, which is what a later open compares against to decide whether the
 * signatures in this snapshot are still live.
 *
 * Throws on an invalidated tree. {@link PlTreeState.dumpState} would happily read through
 * one, and a terminated or inconsistent tree is exactly what must not reach disk, so the
 * caller has to capture before it tears the tree down.
 */
export function captureTreeState(state: PlTreeState, witness: ResourceSignature): PersistedTree {
  if (!state.isValid) throw new Error("refusing to capture an invalidated tree");
  return { witness, roots: [...state.roots], resources: state.dumpState() };
}

/**
 * Rebuilds a tree from a snapshot, or returns undefined if the snapshot cannot be applied.
 *
 * The snapshot goes through {@link PlTreeState.updateFromResourceData}, the same call the
 * live loading path uses, so every invariant that path enforces is enforced here and cannot
 * drift from it. Reference counts are applied after the whole batch, so the order resources
 * appear in the file does not matter, and finality is recomputed from `finalPredicate`
 * rather than read from the file.
 *
 * The tree is built fresh and thrown away on failure: that call invalidates the tree it is
 * given when it finds an inconsistency, so restoring into a live tree would destroy a
 * working one instead of falling back to a cold open.
 */
export function restoreTreeState(
  snapshot: PersistedTree,
  finalPredicate: FinalResourceDataPredicate,
  ops: { roots?: Set<SignedResourceId>; logger?: MiLogger } = {},
): PlTreeState | undefined {
  const roots = ops.roots ?? new Set(snapshot.roots);
  const restored = new PlTreeState(roots, finalPredicate);
  try {
    // allowOrphanInputs mirrors the live path. The check that matters for a snapshot is the
    // orphan-reference one, which runs either way and catches a corpus referencing an id it
    // does not carry.
    restored.updateFromResourceData([...snapshot.resources], { allowOrphanInputs: true });
    return restored;
  } catch (e: unknown) {
    ops.logger?.warn(
      `tree snapshot could not be restored, opening cold: ${e instanceof Error ? e.message : String(e)}`,
    );
    return undefined;
  }
}

//
// Encoding
//

/** Serializes a tree mirror to the on-disk format. */
export async function encodePersistedTree(
  tree: PersistedTree,
  ops: EncodePersistedTreeOps = {},
): Promise<Buffer> {
  const compress = ops.compress ?? true;

  const payload = writePayload(tree);
  const stored = compress ? await deflateAsync(payload) : payload;

  const header = new Writer(HEADER_FIXED_BYTES + tree.witness.length);
  header.u32(MAGIC);
  header.u16(PERSISTED_TREE_SCHEMA_VERSION);
  header.u16(compress ? FLAG_COMPRESSED : 0);
  header.shortBytes(tree.witness);

  const trailer = new Writer(TRAILER_BYTES);
  trailer.u32(stored.length);
  trailer.u32(crc32(stored));

  return Buffer.concat([header.result(), stored, trailer.result()]);
}

function writePayload(tree: PersistedTree): Buffer {
  // Signatures are collected from every id mentioned anywhere, not just from resource
  // bodies. originalResourceId is not refcounted by the tree, so a duplicate's original
  // can be referenced without being held, and its signature would otherwise be lost.
  const signatures = new Map<bigint, ResourceSignature>();
  const collect = (id: OptionalSignedResourceId) => {
    if (!isNotNullSignedResourceId(id)) return;
    const { globalId, signature } = parseSignedResourceId(id);
    signatures.set(globalId, signature);
  };

  for (const root of tree.roots) collect(root);
  for (const res of tree.resources) {
    collect(res.id);
    collect(res.originalResourceId);
    collect(res.error);
    for (const f of res.fields) {
      collect(f.value);
      collect(f.error);
    }
  }

  const w = new Writer();

  w.u32(tree.roots.length);
  for (const root of tree.roots) w.u64(globalIdOf(root));

  w.u32(signatures.size);
  for (const [globalId, signature] of signatures) {
    w.u64(globalId);
    w.shortBytes(signature);
  }

  w.u32(tree.resources.length);
  for (const res of tree.resources) writeResource(w, res);

  return w.result();
}

function writeResource(w: Writer, res: ExtendedResourceData) {
  w.u64(globalIdOf(res.id));
  w.u64(optionalGlobalIdOf(res.originalResourceId));
  w.u64(optionalGlobalIdOf(res.error));

  w.u8(indexOfOrThrow(KINDS, res.kind, "resource kind"));
  w.str(res.type.name);
  w.str(res.type.version);

  w.u8(
    (res.data !== undefined ? RES_HAS_DATA : 0) |
      (res.inputsLocked ? RES_INPUTS_LOCKED : 0) |
      (res.outputsLocked ? RES_OUTPUTS_LOCKED : 0) |
      (res.resourceReady ? RES_READY : 0) |
      (res.final ? RES_FINAL : 0),
  );
  if (res.data !== undefined) w.bytes(res.data);

  w.u32(res.fields.length);
  for (const f of res.fields) {
    w.str(f.name);
    w.u8(indexOfOrThrow(FIELD_TYPES, f.type, "field type"));
    w.u8(indexOfOrThrow(FIELD_STATUSES, f.status, "field status"));
    w.u64(optionalGlobalIdOf(f.value));
    w.u64(optionalGlobalIdOf(f.error));
    w.u8(f.valueIsFinal ? 1 : 0);
  }

  w.u32(res.kv.length);
  for (const kv of res.kv) {
    w.str(kv.key);
    w.bytes(kv.value);
  }
}

//
// Decoding
//

/** Reads magic, schema version and witness without touching the payload. Cheap enough to
 *  run on every open, which is what makes a rotated-session miss cheap. */
export function readPersistedTreeHeader(
  bytes: Uint8Array,
): PersistedTreeReadResult<PersistedTreeHeader> {
  try {
    if (bytes.length < HEADER_FIXED_BYTES + TRAILER_BYTES) return failure("not-a-snapshot");

    const r = new Reader(bytes);
    if (r.u32() !== MAGIC) return failure("not-a-snapshot");

    const schemaVersion = r.u16();
    r.u16(); // flags, only meaningful to the full decode
    const witness = toResourceSignature(r.shortBytes());

    if (schemaVersion !== PERSISTED_TREE_SCHEMA_VERSION) return failure("unknown-schema");

    return { ok: true, value: { schemaVersion, witness } };
  } catch {
    // Any bounds violation while reading a fixed-size header means the file is not one.
    return failure("not-a-snapshot");
  }
}

/** Reads a whole snapshot. Never throws: a torn, corrupt, foreign or unreadable file is
 *  reported as a failure reason, so the caller opens cold instead of replaying garbage. */
export async function decodePersistedTree(
  bytes: Uint8Array,
): Promise<PersistedTreeReadResult<PersistedTree>> {
  const header = readPersistedTreeHeader(bytes);
  if (!header.ok) return header;

  let payload: Uint8Array;
  try {
    const r = new Reader(bytes);
    r.skip(4 + 2); // magic, schema
    const flags = r.u16();
    r.shortBytes(); // witness, already read
    const payloadStart = r.position;

    // The trailer's length is what says where the payload ends. Deriving it from the file
    // size instead would accept a file with trailing garbage as intact.
    const trailer = new Reader(bytes);
    trailer.skip(bytes.length - TRAILER_BYTES);
    const payloadLength = trailer.u32();
    const checksum = trailer.u32();

    if (payloadStart + payloadLength !== bytes.length - TRAILER_BYTES) return failure("truncated");

    const stored = bytes.subarray(payloadStart, payloadStart + payloadLength);
    if (crc32(stored) !== checksum) return failure("checksum");

    payload = (flags & FLAG_COMPRESSED) !== 0 ? await inflateAsync(stored) : stored;
  } catch {
    // Includes inflate failures: a payload that passes its checksum but will not
    // decompress is damaged in a way we cannot distinguish from corruption.
    return failure("checksum");
  }

  try {
    return { ok: true, value: readPayload(payload, header.value.witness) };
  } catch {
    return failure("malformed");
  }
}

function readPayload(payload: Uint8Array, witness: ResourceSignature): PersistedTree {
  const r = new Reader(payload);

  const rootCount = r.u32();
  const rootIds: bigint[] = [];
  for (let i = 0; i < rootCount; i++) rootIds.push(r.u64());

  const signatureCount = r.u32();
  const signatures = new Map<bigint, ResourceSignature>();
  for (let i = 0; i < signatureCount; i++) {
    const globalId = r.u64();
    signatures.set(globalId, toResourceSignature(r.shortBytes()));
  }

  /** Rejoins a stored global id with its signature. A reference with no table entry is
   *  malformed rather than recoverable: an unsigned id addresses nothing. */
  const signed = (globalId: bigint): SignedResourceId => {
    const signature = signatures.get(globalId);
    if (signature === undefined) throw new Error(`no signature stored for global id ${globalId}`);
    return createSignedResourceId(globalId, signature);
  };
  const optionalSigned = (globalId: bigint): OptionalSignedResourceId =>
    globalId === NO_REFERENCE ? NullSignedResourceId : signed(globalId);

  const roots = rootIds.map(signed);

  const resourceCount = r.u32();
  const resources: ExtendedResourceData[] = [];
  for (let i = 0; i < resourceCount; i++) resources.push(readResource(r, signed, optionalSigned));

  if (!r.atEnd) throw new Error("trailing bytes in snapshot payload");

  return { witness, roots, resources };
}

function readResource(
  r: Reader,
  signed: (globalId: bigint) => SignedResourceId,
  optionalSigned: (globalId: bigint) => OptionalSignedResourceId,
): ExtendedResourceData {
  const id = signed(r.u64());
  const originalResourceId = optionalSigned(r.u64());
  const error = optionalSigned(r.u64());

  const kind = atOrThrow(KINDS, r.u8(), "resource kind");
  const type = { name: r.str(), version: r.str() };

  const flags = r.u8();
  const data = (flags & RES_HAS_DATA) !== 0 ? r.bytes() : undefined;

  const fieldCount = r.u32();
  const fields: FieldData[] = [];
  for (let i = 0; i < fieldCount; i++) {
    const name = r.str();
    const fieldType = atOrThrow(FIELD_TYPES, r.u8(), "field type");
    const status = atOrThrow(FIELD_STATUSES, r.u8(), "field status");
    const value = optionalSigned(r.u64());
    const fieldError = optionalSigned(r.u64());
    const valueIsFinal = r.u8() !== 0;
    fields.push({ name, type: fieldType, status, value, error: fieldError, valueIsFinal });
  }

  const kvCount = r.u32();
  const kv: KeyValue[] = [];
  for (let i = 0; i < kvCount; i++) kv.push({ key: r.str(), value: r.bytes() });

  return {
    id,
    originalResourceId,
    error,
    kind,
    type,
    data,
    inputsLocked: (flags & RES_INPUTS_LOCKED) !== 0,
    outputsLocked: (flags & RES_OUTPUTS_LOCKED) !== 0,
    resourceReady: (flags & RES_READY) !== 0,
    final: (flags & RES_FINAL) !== 0,
    fields,
    kv,
  };
}

//
// Helpers
//

function failure(reason: PersistedTreeReadFailure): {
  ok: false;
  reason: PersistedTreeReadFailure;
} {
  return { ok: false, reason };
}

function globalIdOf(id: SignedResourceId): bigint {
  return parseSignedResourceId(id).globalId;
}

function optionalGlobalIdOf(id: OptionalSignedResourceId): bigint {
  return isNotNullSignedResourceId(id) ? globalIdOf(id) : NO_REFERENCE;
}

function indexOfOrThrow<T>(values: readonly T[], value: T, what: string): number {
  const idx = values.indexOf(value);
  if (idx < 0) throw new Error(`unknown ${what}: ${String(value)}`);
  return idx;
}

function atOrThrow<T>(values: readonly T[], idx: number, what: string): T {
  if (idx < 0 || idx >= values.length) throw new Error(`unknown ${what} index: ${idx}`);
  return values[idx];
}

/** Table-driven CRC-32 (IEEE). Node's `zlib.crc32` would do, but it landed in 22.2 and
 *  the repo's floor is 22, so this keeps the format readable on every supported runtime
 *  without adding a dependency. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Growable little-endian writer. Doubling keeps a ten megabyte tree to a handful of
 *  reallocations. */
class Writer {
  private buf: Buffer;
  private pos = 0;

  constructor(initialBytes = 1 << 16) {
    this.buf = Buffer.allocUnsafe(Math.max(initialBytes, 16));
  }

  private ensure(extra: number) {
    if (this.pos + extra <= this.buf.length) return;
    let size = this.buf.length;
    while (size < this.pos + extra) size *= 2;
    const next = Buffer.allocUnsafe(size);
    this.buf.copy(next, 0, 0, this.pos);
    this.buf = next;
  }

  u8(v: number) {
    this.ensure(1);
    this.pos = this.buf.writeUInt8(v, this.pos);
  }

  u16(v: number) {
    this.ensure(2);
    this.pos = this.buf.writeUInt16LE(v, this.pos);
  }

  u32(v: number) {
    this.ensure(4);
    this.pos = this.buf.writeUInt32LE(v, this.pos);
  }

  u64(v: bigint) {
    this.ensure(8);
    this.pos = this.buf.writeBigUInt64LE(v, this.pos);
  }

  /** u32-prefixed. For resource data and kv values, which have no small bound. */
  bytes(b: Uint8Array) {
    this.u32(b.length);
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }

  /** u16-prefixed. For signatures, which are a hash and cannot approach 64 KB. */
  shortBytes(b: Uint8Array) {
    if (b.length > 0xffff) throw new Error(`value too long for a short field: ${b.length}`);
    this.u16(b.length);
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }

  str(s: string) {
    this.bytes(Buffer.from(s, "utf8"));
  }

  result(): Buffer {
    return this.buf.subarray(0, this.pos);
  }
}

/** Little-endian reader. Every accessor bounds-checks, so a truncated payload throws
 *  rather than reading past its end; callers turn that into a failure reason. */
class Reader {
  private pos = 0;
  private readonly view: DataView;

  constructor(private readonly src: Uint8Array) {
    this.view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  }

  get position(): number {
    return this.pos;
  }

  get atEnd(): boolean {
    return this.pos === this.src.length;
  }

  private take(n: number): number {
    if (n < 0 || this.pos + n > this.src.length)
      throw new Error(`read past end of snapshot: need ${n} at ${this.pos}`);
    const at = this.pos;
    this.pos += n;
    return at;
  }

  skip(n: number) {
    this.take(n);
  }

  u8(): number {
    return this.view.getUint8(this.take(1));
  }

  u16(): number {
    return this.view.getUint16(this.take(2), true);
  }

  u32(): number {
    return this.view.getUint32(this.take(4), true);
  }

  u64(): bigint {
    return this.view.getBigUint64(this.take(8), true);
  }

  bytes(): Uint8Array {
    const length = this.u32();
    const at = this.take(length);
    return this.src.subarray(at, at + length);
  }

  shortBytes(): Uint8Array {
    const length = this.u16();
    const at = this.take(length);
    return this.src.subarray(at, at + length);
  }

  str(): string {
    return Buffer.from(this.bytes()).toString("utf8");
  }
}
