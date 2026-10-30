/** Logs of an exec with fallbacks: every attempt streams into its own `StreamManager/2`, and a
 * `StreamCollection/1` holds them (exec fallbacks spec, §13). The driver shows the attempts one
 * after another as one text: every finished attempt's log, a delimiter built from its outcome,
 * then the next attempt's log, the last one live while it runs. */

import type { ComputableCtx } from "@milaboratories/computable";
import type { ResourceType } from "@milaboratories/pl-client";
import { isNotFoundError } from "@milaboratories/pl-client";
import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import type * as sdk from "@milaboratories/pl-model-common";
import type { CompositeLogPart } from "./helpers/logs_handle";
import {
  isLiveLogHandle,
  newCompositeLogHandle,
  newLogHandle,
  parseCompositeLogHandle,
} from "./helpers/logs_handle";

/** The resource the workflow SDK puts into `fileStreams[name]` of an exec with fallbacks.
 * Fields: dynamic `attempt<K>` (attempt K's `StreamManager/2`), dynamic `outcome<K>` (attempt K's
 * history entry, written when it ends) and `stream` (a mirror for drivers that predate it). */
/** Per-read state: whether any part answered that its handle is outdated. */
type ReadState = { outdated: boolean };

export const StreamCollectionResourceType: ResourceType = {
  name: "StreamCollection",
  version: "1",
};

export function isStreamCollection(rType: ResourceType): boolean {
  return (
    rType.name === StreamCollectionResourceType.name &&
    rType.version === StreamCollectionResourceType.version
  );
}

/** A stream that is still written to; anything else a manager points at is a blob. */
export function isStreamWorkdir(rType: ResourceType): boolean {
  return rType.name.startsWith("StreamWorkdir");
}

/** History entry of one attempt, `outcome<K>` of the collection (spec §12.4). */
export type AttemptOutcome = {
  attempt?: number;
  plan?: string;
  result: "success" | "fail";
  reason?: string;
  exitCode?: number;
  restart?: number;
};

export function parseAttemptOutcome(data: unknown): AttemptOutcome | undefined {
  if (typeof data !== "object" || data === null || !("result" in data)) return undefined;
  if (data.result !== "success" && data.result !== "fail") return undefined;
  const outcome: AttemptOutcome = { result: data.result };
  if ("attempt" in data && typeof data.attempt === "number") outcome.attempt = data.attempt;
  if ("plan" in data && typeof data.plan === "string") outcome.plan = data.plan;
  if ("reason" in data && typeof data.reason === "string") outcome.reason = data.reason;
  if ("exitCode" in data && typeof data.exitCode === "number") outcome.exitCode = data.exitCode;
  if ("restart" in data && typeof data.restart === "number") outcome.restart = data.restart;
  return outcome;
}

/** The line shown after a failed attempt's log, e.g.
 * `--- attempt 0 (root) failed: SoftwareError, exit code 2 ---`. */
export function attemptDelimiter(index: number, outcome: AttemptOutcome): string {
  const attempt = outcome.attempt ?? index;
  const plan = outcome.plan !== undefined ? ` (${outcome.plan})` : "";
  const exitCode = outcome.exitCode !== undefined ? `, exit code ${outcome.exitCode}` : "";
  const restart = outcome.restart ? `, restart ${outcome.restart}` : "";
  return `--- attempt ${attempt}${plan} failed: ${outcome.reason ?? "unknown reason"}${exitCode}${restart} ---`;
}

const attemptFieldRegex = /^attempt(\d+)$/;

/** Builds the composite handle of a `StreamCollection/1`, or undefined until an attempt has
 * started. The handle is live while the last attempt runs or its outcome is unknown; the value
 * is stable only once the last attempt succeeded, since after a failure another one may start. */
export function getCompositeLogHandle(
  ctx: ComputableCtx,
  collection: PlTreeNodeAccessor,
): sdk.AnyLogHandle | undefined {
  // Dynamic fields only: probing for an absent field would keep the value unstable forever.
  const fields = collection.listDynamicFields();
  const attempts = fields
    .map((f) => attemptFieldRegex.exec(f))
    .filter((m) => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);

  if (attempts.length === 0) {
    ctx.markUnstable("no attempts in stream collection");
    return undefined;
  }

  let lastOutcome: AttemptOutcome | undefined;
  let streamsFinal = true;
  const parts = attempts.map((k): CompositeLogPart => {
    const stream = collection.traverse(`attempt${k}`, "stream")?.resourceInfo;
    const outcome = fields.includes(`outcome${k}`)
      ? parseAttemptOutcome(collection.traverse(`outcome${k}`)?.getDataAsJson())
      : undefined;
    lastOutcome = outcome;

    const part: CompositeLogPart = {};
    // A failed attempt whose manager has no stream never wrote the file: its manager's file
    // errored and the manager left `stream` unset for good. It reads as empty, and is final. So
    // does the workflow SDK's stand-in for a file never written, a JSON value.
    if (stream === undefined) {
      if (outcome?.result !== "fail") streamsFinal = false;
    } else if (stream.type.name.startsWith("json/")) {
      // empty and final
    } else {
      const live = isStreamWorkdir(stream.type);
      if (live) streamsFinal = false;
      part.handle = newLogHandle(live, stream);
    }
    if (outcome?.result === "fail") part.delimiter = attemptDelimiter(k, outcome);
    return part;
  });

  const live = !streamsFinal || lastOutcome === undefined;
  if (live || lastOutcome?.result !== "success")
    ctx.markUnstable(
      "The stream collection is not complete: an attempt is running or another one may start.",
    );

  return newCompositeLogHandle(live, parts);
}

/** Reads one log of a single (not composite) handle. */
export type SingleLogReader = Pick<sdk.LogsDriver, "lastLines" | "readText">;

type Segment = { size: number } &
  /** last: the running (or final) attempt's part */
  ({ kind: "part"; handle: sdk.AnyLogHandle; last: boolean } | { kind: "text"; bytes: Uint8Array });

type PartInfo = { size: number; endsWithNewline: boolean };

const newline = 10;
const maxCachedParts = 1000;

/** Reads a composite handle as one text: offsets the viewer passes are offsets in the joined
 * text, mapped to an attempt's log or a delimiter here. */
export class CompositeLogReader {
  /** Size and last byte of ready parts: a blob never changes. */
  private readonly readyParts = new Map<string, PartInfo>();

  constructor(private readonly single: SingleLogReader) {}

  async lastLines(
    handle: sdk.AnyLogHandle,
    lineCount: number,
    offsetBytes?: number,
    searchStr?: string,
  ): Promise<sdk.StreamingApiResponse> {
    const { live, parts } = parseCompositeLogHandle(handle);
    const read: ReadState = { outdated: false };
    const segments = await this.segments(parts, read);
    if (read.outdated) return { shouldUpdateHandle: true };
    const total = segments.reduce((sum, s) => sum + s.size, 0);

    if (lineCount === 0)
      return {
        live,
        shouldUpdateHandle: false,
        data: new Uint8Array(),
        size: total,
        newOffset: total,
      };

    // As the backend does: no offset, or one out of range, reads from the end.
    const end =
      offsetBytes !== undefined && offsetBytes > 0 && offsetBytes < total ? offsetBytes : total;

    const chunks: Uint8Array[] = [];
    let linesLeft = lineCount;
    let newOffset = 0;
    let start = total;
    for (let i = segments.length - 1; i >= 0 && linesLeft > 0; i--) {
      const s = segments[i];
      start -= s.size;
      const localEnd = Math.min(end, start + s.size) - start;
      if (localEnd <= 0) continue;

      if (s.kind === "text") {
        const bytes = s.bytes.subarray(0, localEnd);
        if (!matches(bytes, searchStr)) continue;
        chunks.unshift(bytes);
        linesLeft -= countLines(bytes);
        newOffset = start;
        continue;
      }

      const resp = await this.readPart(s.last ? undefined : read, () =>
        this.single.lastLines(s.handle, linesLeft, localEnd, searchStr),
      );
      if (resp === undefined || resp.data.length === 0) continue;
      chunks.unshift(resp.data);
      linesLeft -= countLines(resp.data);
      newOffset = start + resp.newOffset;
    }

    if (read.outdated) return { shouldUpdateHandle: true };
    return { live, shouldUpdateHandle: false, data: concat(chunks), size: total, newOffset };
  }

  async readText(
    handle: sdk.AnyLogHandle,
    lineCount: number,
    offsetBytes?: number,
    searchStr?: string,
  ): Promise<sdk.StreamingApiResponse> {
    const { live, parts } = parseCompositeLogHandle(handle);
    const read: ReadState = { outdated: false };
    const segments = await this.segments(parts, read);
    if (read.outdated) return { shouldUpdateHandle: true };

    const chunks: Uint8Array[] = [];
    const limited = lineCount > 0;
    let linesLeft = lineCount;
    let pos = offsetBytes ?? 0;
    let start = 0;
    let reading = true;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      const isLast = i === segments.length - 1;
      // The last segment may be a live log that has grown since its size was taken.
      const inSegment = pos < start + s.size || (isLast && pos === start + s.size);
      if (reading && pos >= start && inSegment) {
        const local = pos - start;
        if (s.kind === "text") {
          const bytes = s.bytes.subarray(local);
          if (matches(bytes, searchStr)) {
            chunks.push(bytes);
            linesLeft -= countLines(bytes);
          }
          pos = start + s.size;
        } else {
          const resp = await this.readPart(s.last ? undefined : read, () =>
            this.single.readText(s.handle, limited ? linesLeft : lineCount, local, searchStr),
          );
          if (resp === undefined) pos = start + s.size;
          else {
            chunks.push(resp.data);
            linesLeft -= countLines(resp.data);
            s.size = Math.max(s.size, resp.size);
            pos = start + resp.newOffset;
            // The line limit is reached or a live log ends in an incomplete line.
            if (resp.newOffset < resp.size) reading = false;
          }
        }
        if (limited && linesLeft <= 0) reading = false;
      }
      start += s.size;
    }

    if (read.outdated) return { shouldUpdateHandle: true };
    return { live, shouldUpdateHandle: false, data: concat(chunks), size: start, newOffset: pos };
  }

  /** The joined text as segments: each attempt's log, then its delimiter if it failed. */
  private async segments(parts: CompositeLogPart[], read: ReadState): Promise<Segment[]> {
    // Only an earlier attempt's outdated part outdates the handle: the running attempt's live
    // file may simply not exist yet, which the stream driver reports the same way (§13.1).
    const infos = await Promise.all(
      parts.map((p, i) =>
        p.handle === undefined
          ? undefined
          : this.partInfo(p.handle, i === parts.length - 1 ? undefined : read),
      ),
    );

    const segments: Segment[] = [];
    parts.forEach((p, i) => {
      const info = infos[i];
      if (p.handle !== undefined)
        segments.push({
          kind: "part",
          handle: p.handle,
          size: info?.size ?? 0,
          last: i === parts.length - 1,
        });
      if (p.delimiter !== undefined) {
        // An attempt's log may end in the middle of a line: the delimiter starts a new one.
        const lead = info !== undefined && !info.endsWithNewline ? "\n" : "";
        const bytes = new TextEncoder().encode(`${lead}${p.delimiter}\n`);
        segments.push({ kind: "text", bytes, size: bytes.length });
      }
    });
    return segments;
  }

  private async partInfo(handle: sdk.AnyLogHandle, read?: ReadState): Promise<PartInfo> {
    const cached = this.readyParts.get(handle);
    if (cached !== undefined) return cached;

    const resp = await this.readPart(read, () => this.single.lastLines(handle, 1));
    const info: PartInfo =
      resp === undefined
        ? { size: 0, endsWithNewline: true }
        : {
            size: resp.size,
            endsWithNewline: resp.data.length === 0 || resp.data[resp.data.length - 1] === newline,
          };

    if (resp !== undefined && !isLiveLogHandle(handle)) {
      if (this.readyParts.size >= maxCachedParts) this.readyParts.clear();
      this.readyParts.set(handle, info);
    }
    return info;
  }

  /** Reads one part; a part that does not exist (yet) reads as empty. An attempt may never write
   * the file at all, and the earlier attempts' text must stay readable then (spec §13.1). A part
   * whose handle is outdated (its live stream ended and the manager switched to the file) marks
   * the whole read outdated: the viewer then fetches a new composite handle instead of seeing
   * that part's text vanish from the joined text (review finding m3). */
  private async readPart(
    state: ReadState | undefined,
    read: () => Promise<sdk.StreamingApiResponse>,
  ): Promise<sdk.StreamingApiResponseOk | undefined> {
    try {
      const resp = await read();
      if (resp.shouldUpdateHandle) {
        if (state !== undefined) state.outdated = true;
        return undefined;
      }
      return resp;
    } catch (e: unknown) {
      if (isNotFoundError(e)) return undefined;
      throw e;
    }
  }
}

function countLines(bytes: Uint8Array): number {
  let n = 0;
  for (const b of bytes) if (b === newline) n++;
  if (bytes.length > 0 && bytes[bytes.length - 1] !== newline) n++;
  return n;
}

function matches(bytes: Uint8Array, searchStr: string | undefined): boolean {
  return !searchStr || new TextDecoder().decode(bytes).includes(searchStr);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
