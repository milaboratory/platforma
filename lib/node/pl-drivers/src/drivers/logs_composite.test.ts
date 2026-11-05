import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Computable } from "@milaboratories/computable";
import type {
  FieldData,
  OptionalSignedResourceId,
  ResourceType,
  SignedResourceId,
  WireClientProvider,
  WireClientProviderFactory,
} from "@milaboratories/pl-client";
import {
  NullSignedResourceId,
  TreeFinality,
  createSignedResourceId,
  parseSignedResourceId,
} from "@milaboratories/pl-client";
import { isCompositeLogHandle, isLiveLog } from "@milaboratories/pl-model-common";
import type { AnyLogHandle, StreamingApiResponse } from "@milaboratories/pl-model-common";
import type { ExtendedResourceData, ResourceInfo } from "@milaboratories/pl-tree";
import { PlTreeState } from "@milaboratories/pl-tree";
import { ConsoleLoggerAdapter, HmacSha256Signer } from "@milaboratories/ts-helpers";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Agent } from "undici";
import { ClientDownload } from "../clients/download";
import { ClientLogs } from "../clients/logs";
import type { StreamingAPI_Response } from "../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol";
import { DownloadDriver } from "./download_blob/download_blob";
import { LogsDriver } from "./logs";
import { attemptDelimiter } from "./logs_composite";
import {
  maxCompositeLogParts,
  newCompositeLogHandle,
  parseCompositeLogHandle,
} from "./helpers/logs_handle";
import { LogsStreamDriver } from "./logs_stream";

//
// A tree of resources, as the workflow SDK builds it for an exec with fallbacks (spec §13.3),
// and an in-memory streaming API that serves the logs those resources point at.
//

const rid = (n: number) => createSignedResourceId(BigInt(1_000_000 + n));

const CollectionType: ResourceType = { name: "StreamCollection", version: "1" };
const ManagerType: ResourceType = { name: "StreamManager", version: "2" };
const LiveStreamType: ResourceType = { name: "StreamWorkdir/main", version: "1" };
const BlobType: ResourceType = { name: "Blob/main", version: "1" };
const JsonType: ResourceType = { name: "json/object", version: "1" };
const ErrorType: ResourceType = { name: "json/resourceError", version: "1" };

function resource(
  id: SignedResourceId,
  type: ResourceType,
  fields: FieldData[] = [],
  data?: string,
): ExtendedResourceData {
  return {
    id,
    type,
    kind: data === undefined ? "Structural" : "Value",
    originalResourceId: NullSignedResourceId,
    error: NullSignedResourceId,
    inputsLocked: data !== undefined,
    outputsLocked: data !== undefined,
    resourceReady: data !== undefined,
    final: false,
    kv: [],
    fields,
    data: data === undefined ? undefined : new TextEncoder().encode(data),
  };
}

function dField(name: string, value: OptionalSignedResourceId = NullSignedResourceId): FieldData {
  return {
    name,
    type: "Dynamic",
    value,
    error: NullSignedResourceId,
    status: value === NullSignedResourceId ? "Empty" : "Resolved",
    valueIsFinal: false,
  };
}

class NotFoundError extends Error {
  name = "RpcError";
  code = "NOT_FOUND";
}

type StoredLog = { text: string; final: boolean };

/** Serves logs by resource id the way the backend's streaming API does (datactl
 * `grpc_server_stream.go`): a live log yields only complete lines, an absent one is NOT_FOUND. */
class InMemoryClientLogs extends ClientLogs {
  public readonly logs = new Map<bigint, StoredLog>();

  private get(rInfo: ResourceInfo): StoredLog {
    const log = this.logs.get(parseSignedResourceId(rInfo.id).globalId);
    if (log === undefined) throw new NotFoundError(`no log for ${rInfo.id}`);
    return log;
  }

  public override async lastLines(
    rInfo: ResourceInfo,
    lineCount: number,
    offsetBytes: bigint = 0n,
  ): Promise<StreamingAPI_Response> {
    const { text, final } = this.get(rInfo);
    const size = BigInt(text.length);
    if (lineCount === 0) return { data: new Uint8Array(), size, newOffset: size };

    const end = offsetBytes > 0n && offsetBytes < size ? Number(offsetBytes) : text.length;
    let lines = splitLines(text.slice(0, end));
    if (!final && lines.length > 0 && !lines[lines.length - 1].endsWith("\n"))
      lines = lines.slice(0, -1);
    const taken = lines.slice(-lineCount).join("");
    const first = lines.slice(0, -lineCount).join("").length;
    return {
      data: new TextEncoder().encode(taken),
      size,
      newOffset: BigInt(lines.length > lineCount ? first : 0),
    };
  }

  public override async readText(
    rInfo: ResourceInfo,
    lineCount: number,
    offsetBytes: bigint = 0n,
  ): Promise<StreamingAPI_Response> {
    const { text, final } = this.get(rInfo);
    let lines = splitLines(text.slice(Number(offsetBytes)));
    if (!final && lines.length > 0 && !lines[lines.length - 1].endsWith("\n"))
      lines = lines.slice(0, -1);
    const taken = lines.slice(0, lineCount).join("");
    return {
      data: new TextEncoder().encode(taken),
      size: BigInt(text.length),
      newOffset: offsetBytes + BigInt(taken.length),
    };
  }
}

function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** Never reached: every read in these tests goes through the overridden methods. */
const noWire: WireClientProviderFactory = {
  createWireClientProvider<Client>(): WireClientProvider<Client> {
    return {
      get(): Client {
        throw new Error("no wire in this test");
      },
    };
  },
};

type Env = {
  logs: LogsDriver;
  clientLogs: InMemoryClientLogs;
  tree: PlTreeState;
  root: SignedResourceId;
  /** Leaf resources already in the tree: the tree refuses a second body of a final one. */
  sent: Set<SignedResourceId>;
};

let dirs: string[] = [];

async function setup(root: SignedResourceId): Promise<Env> {
  const logger = new ConsoleLoggerAdapter();
  const http = new Agent();
  const clientLogs = new InMemoryClientLogs(noWire, http, logger);
  const saveDir = await fsp.mkdtemp(path.join(os.tmpdir(), "test-composite-logs-"));
  const rangesDir = await fsp.mkdtemp(path.join(os.tmpdir(), "test-composite-logs-ranges-"));
  dirs.push(saveDir, rangesDir);
  const download = new DownloadDriver(
    logger,
    new ClientDownload(noWire, http, logger, []),
    clientLogs,
    saveDir,
    rangesDir,
    new HmacSha256Signer(HmacSha256Signer.generateSecret()),
    { cacheSoftSizeBytes: 1024, nConcurrentDownloads: 1, rangesCacheMaxSizeBytes: 1024 },
  );
  const logsStream = new LogsStreamDriver(logger, clientLogs);
  const logs = new LogsDriver(logger, logsStream, download);
  return {
    logs,
    clientLogs,
    tree: new PlTreeState(root, TreeFinality.predicate()),
    root,
    sent: new Set(),
  };
}

beforeEach(() => {
  dirs = [];
});

afterEach(async () => {
  await Promise.all(dirs.map((d) => fsp.rm(d, { recursive: true, force: true })));
});

/** One attempt of a collection: its manager, the stream the manager points at, its outcome. */
type Attempt = {
  stream?: { kind: "live" | "blob" | "notWritten"; text?: string };
  /** the manager's final content errored (what the router's error does to the last attempt) */
  downloadableError?: boolean;
  outcome?: Record<string, unknown>;
};

/** Puts a collection with the given attempts into the tree; ids are derived from the index,
 * so a later call updates the same resources. */
function setCollection(env: Env, attempts: Attempt[]) {
  const resources: ExtendedResourceData[] = [];
  const addLeaf = (r: ExtendedResourceData) => {
    if (env.sent.has(r.id)) return;
    env.sent.add(r.id);
    resources.push(r);
  };
  const fields: FieldData[] = [];
  attempts.forEach((a, k) => {
    const managerId = rid(100 + k * 10);
    const streamId = rid(100 + k * 10 + (a.stream?.kind === "blob" ? 2 : 1));
    const outcomeId = rid(100 + k * 10 + 3);
    fields.push(dField(`attempt${k}`, managerId));

    const managerFields: FieldData[] = [];
    if (a.stream !== undefined) {
      managerFields.push(dField("stream", streamId));
      addLeaf(
        a.stream.kind === "notWritten"
          ? resource(streamId, JsonType, [], JSON.stringify({ streamFileNotWritten: "err.log" }))
          : resource(streamId, a.stream.kind === "blob" ? BlobType : LiveStreamType),
      );
      if (a.stream.text !== undefined)
        env.clientLogs.logs.set(parseSignedResourceId(streamId).globalId, {
          text: a.stream.text,
          final: a.stream.kind === "blob",
        });
    } else managerFields.push(dField("stream"));
    if (a.downloadableError) {
      const errorId = rid(100 + k * 10 + 4);
      managerFields.push({
        name: "downloadable",
        type: "Input",
        value: NullSignedResourceId,
        error: errorId,
        status: "Resolved",
        valueIsFinal: true,
      });
      addLeaf(resource(errorId, ErrorType, [], JSON.stringify({ message: "router failed" })));
    }
    resources.push(resource(managerId, ManagerType, managerFields));

    if (a.outcome !== undefined) {
      fields.push(dField(`outcome${k}`, outcomeId));
      addLeaf(resource(outcomeId, JsonType, [], JSON.stringify(a.outcome)));
    }
  });
  fields.push(dField("stream"));
  env.tree.updateFromResourceData([resource(env.root, CollectionType, fields), ...resources]);
}

function handleOf(env: Env) {
  return Computable.make((ctx) => env.logs.getLogHandle(env.tree.entry(), ctx));
}

async function readAll(logs: LogsDriver, handle: AnyLogHandle, lineCount = 100) {
  let text = "";
  let offset = 0;
  let last: StreamingApiResponse | undefined;
  for (let i = 0; i < 100; i++) {
    last = await logs.readText(handle, lineCount, offset);
    if (last.shouldUpdateHandle) throw new Error("unexpected outdated handle");
    text += new TextDecoder().decode(last.data);
    offset = last.newOffset;
    if (last.newOffset >= last.size) break;
  }
  return { text, last };
}

const decode = (r: StreamingApiResponse) => {
  if (r.shouldUpdateHandle) throw new Error("unexpected outdated handle");
  return new TextDecoder().decode(r.data);
};

const rootFailed = {
  attempt: 0,
  plan: "root",
  result: "fail",
  reason: "SoftwareError",
  exitCode: 2,
};
const rootDelimiter = "--- attempt 0 (root) failed: SoftwareError, exit code 2 ---\n";

describe("composite log handle of a StreamCollection", () => {
  test("delimiter names the attempt, plan, reason and exit code", () => {
    expect(attemptDelimiter(0, { ...rootFailed, result: "fail" })).toBe(rootDelimiter.trimEnd());
    expect(attemptDelimiter(3, { result: "fail", reason: "GPUMissed" })).toBe(
      "--- attempt 3 failed: GPUMissed ---",
    );
    expect(attemptDelimiter(1, { result: "fail", plan: "moreRam", restart: 1 })).toBe(
      "--- attempt 1 (moreRam) failed: unknown reason, restart 1 ---",
    );
  });

  test("no attempt yet: no handle", async () => {
    const env = await setup(rid(1));
    setCollection(env, []);
    const r = await handleOf(env).getFullValue();
    expect(r.value).toBeUndefined();
    expect(r.stable).toBe(false);
  });

  test("attempts in order, failed one followed by its delimiter, last one live", async () => {
    const env = await setup(rid(1));
    setCollection(env, [
      { stream: { kind: "blob", text: "root\n" }, outcome: rootFailed },
      { stream: { kind: "live", text: "fallback-0\nfallback-1\n" } },
    ]);

    const r = await handleOf(env).getFullValue();
    const handle = r.value!;
    expect(r.stable).toBe(false);
    expect(isCompositeLogHandle(handle)).toBe(true);
    expect(isLiveLog(handle)).toBe(true);

    const { text, last } = await readAll(env.logs, handle);
    expect(text).toBe(`root\n${rootDelimiter}fallback-0\nfallback-1\n`);
    expect(last).toMatchObject({ live: true, size: text.length, newOffset: text.length });
  });

  test("offsets map across parts and delimiters", async () => {
    const env = await setup(rid(1));
    setCollection(env, [
      { stream: { kind: "blob", text: "root-a\nroot-b\n" }, outcome: rootFailed },
      {
        stream: { kind: "blob", text: "second\n" },
        outcome: { ...rootFailed, attempt: 1, plan: "b" },
      },
      { stream: { kind: "live", text: "third-a\nthird-b\n" } },
    ]);
    const handle = (await handleOf(env).getValue())!;
    const full =
      "root-a\nroot-b\n" +
      rootDelimiter +
      "second\n" +
      "--- attempt 1 (b) failed: SoftwareError, exit code 2 ---\n" +
      "third-a\nthird-b\n";

    // line by line, as a viewer with a small page would read it
    const { text } = await readAll(env.logs, handle, 1);
    expect(text).toBe(full);

    // from an offset inside the second attempt's log
    const at = full.indexOf("second");
    expect(decode(await env.logs.readText(handle, 100, at))).toBe(full.slice(at));

    // from an offset inside a delimiter
    const inDelimiter = full.indexOf("attempt 0");
    expect(decode(await env.logs.readText(handle, 100, inDelimiter))).toBe(full.slice(inDelimiter));

    // last lines span parts; their offset pages backwards
    const tail = await env.logs.lastLines(handle, 4);
    expect(decode(tail)).toBe(
      "second\n--- attempt 1 (b) failed: SoftwareError, exit code 2 ---\nthird-a\nthird-b\n",
    );
    if (tail.shouldUpdateHandle) throw new Error("unexpected outdated handle");
    expect(tail.newOffset).toBe(at);
    expect(tail.size).toBe(full.length);
    const before = await env.logs.lastLines(handle, 100, tail.newOffset);
    expect(decode(before)).toBe(full.slice(0, at));
  });

  test("live, then final once the last attempt succeeded", async () => {
    const env = await setup(rid(1));
    const c = handleOf(env);
    setCollection(env, [
      { stream: { kind: "blob", text: "root\n" }, outcome: rootFailed },
      { stream: { kind: "live", text: "fallback-0\n" } },
    ]);
    const live = await c.getFullValue();
    expect(live.stable).toBe(false);
    expect(isLiveLog(live.value)).toBe(true);

    // the attempt's manager switched to its file, the outcome is not written yet
    setCollection(env, [
      { stream: { kind: "blob", text: "root\n" }, outcome: rootFailed },
      { stream: { kind: "blob", text: "fallback-0\nfallback-1\n" } },
    ]);
    const saving = await c.getFullValue();
    expect(saving.stable).toBe(false);
    expect(isLiveLog(saving.value)).toBe(true);

    setCollection(env, [
      { stream: { kind: "blob", text: "root\n" }, outcome: rootFailed },
      {
        stream: { kind: "blob", text: "fallback-0\nfallback-1\n" },
        outcome: { attempt: 1, plan: "fallback", result: "success", exitCode: 0 },
      },
    ]);
    const done = await c.getFullValue();
    expect(done.stable).toBe(true);
    expect(isLiveLog(done.value)).toBe(false);
    expect(isCompositeLogHandle(done.value!)).toBe(true);

    const { text, last } = await readAll(env.logs, done.value!);
    // the winner is not followed by a delimiter
    expect(text).toBe(`root\n${rootDelimiter}fallback-0\nfallback-1\n`);
    expect(last).toMatchObject({ live: false });
  });

  test("a failed last attempt reads as ready, but stays unstable: another may start", async () => {
    const env = await setup(rid(1));
    setCollection(env, [{ stream: { kind: "blob", text: "root\n" }, outcome: rootFailed }]);
    const r = await handleOf(env).getFullValue();
    expect(r.stable).toBe(false);
    expect(isLiveLog(r.value)).toBe(false);
    expect((await readAll(env.logs, r.value!)).text).toBe(`root\n${rootDelimiter}`);
  });

  test("a collection with one attempt reads as that attempt's log", async () => {
    const env = await setup(rid(1));
    const c = handleOf(env);
    setCollection(env, [{ stream: { kind: "live", text: "only\n" } }]);
    const live = (await c.getValue())!;
    expect(isLiveLog(live)).toBe(true);
    expect((await readAll(env.logs, live)).text).toBe("only\n");

    setCollection(env, [
      {
        stream: { kind: "blob", text: "only\nmore\n" },
        outcome: { attempt: 0, plan: "root", result: "success", exitCode: 0 },
      },
    ]);
    const done = await c.getFullValue();
    expect(done.stable).toBe(true);
    const { text, last } = await readAll(env.logs, done.value!);
    expect(text).toBe("only\nmore\n");
    expect(last).toMatchObject({ live: false, size: 10, newOffset: 10 });
  });

  test("an attempt that never wrote the file: empty part, then its delimiter", async () => {
    const env = await setup(rid(1));
    // attempt 0 has no file at all; attempt 1 runs and has not written it either (§13.1, ex. 2)
    setCollection(env, [
      { stream: { kind: "blob" }, outcome: rootFailed },
      { stream: { kind: "live" } },
    ]);
    const handle = (await handleOf(env).getValue())!;
    const { text, last } = await readAll(env.logs, handle);
    expect(text).toBe(rootDelimiter);
    expect(last).toMatchObject({ live: true });
    expect(decode(await env.logs.lastLines(handle, 10))).toBe(rootDelimiter);
  });

  test("a failed attempt that never wrote the file does not keep the handle live", async () => {
    const env = await setup(rid(1));
    // the reverse of §13.1 example 2: the root never wrote the file, the handler did
    setCollection(env, [
      { stream: undefined, outcome: rootFailed },
      { stream: { kind: "blob", text: "handler\n" }, outcome: { attempt: 1, result: "success" } },
    ]);
    const r = await handleOf(env).getFullValue();
    // ready, so the viewer stops polling; the value itself stays unstable, since the manager's
    // `stream` is a dynamic field that may still be set
    expect(isLiveLog(r.value)).toBe(false);
    expect((await readAll(env.logs, r.value!)).text).toBe(`${rootDelimiter}handler\n`);
  });

  test("the SDK's stand-in for a file never written reads as empty and final", async () => {
    const env = await setup(rid(1));
    setCollection(env, [
      { stream: { kind: "notWritten" }, outcome: rootFailed },
      { stream: { kind: "blob", text: "handler\n" }, outcome: { attempt: 1, result: "success" } },
    ]);
    const r = await handleOf(env).getFullValue();
    expect(isLiveLog(r.value)).toBe(false);
    expect((await readAll(env.logs, r.value!)).text).toBe(`${rootDelimiter}handler\n`);
  });

  test("an attempt still starting (no stream yet, nothing errored) keeps the handle live", async () => {
    const env = await setup(rid(1));
    setCollection(env, [{ stream: { kind: "blob", text: "err\n" }, outcome: rootFailed }, {}]);
    const r = await handleOf(env).getFullValue();
    expect(r.stable).toBe(false);
    expect(isLiveLog(r.value)).toBe(true);
  });

  test("the job failed: the last attempt's manager lost its stream to an error", async () => {
    // the router's error reaches the last attempt's manager through its final content, and the
    // manager resets its stream (review 3, m4; review 4, m1)
    const env = await setup(rid(1));
    setCollection(env, [
      { stream: { kind: "blob", text: "err\n" }, outcome: rootFailed },
      { stream: undefined, downloadableError: true },
    ]);
    const r = await handleOf(env).getFullValue();
    expect(r.stable).toBe(false);
    expect(isLiveLog(r.value)).toBe(false);
    expect((await readAll(env.logs, r.value!)).text).toBe(`err\n${rootDelimiter}`);
  });

  test("an earlier attempt's live stream gone: the whole handle is outdated", async () => {
    const env = await setup(rid(1));
    // attempt 0 failed while its manager still pointed at the live stream, which is gone now
    setCollection(env, [
      { stream: { kind: "live" }, outcome: rootFailed },
      { stream: { kind: "live", text: "next\n" } },
    ]);
    const handle = (await handleOf(env).getValue())!;
    expect(await env.logs.readText(handle, 100)).toEqual({ shouldUpdateHandle: true });
    expect(await env.logs.lastLines(handle, 10)).toEqual({ shouldUpdateHandle: true });
  });

  test("a handle with more parts than allowed is refused; a long collection keeps the latest", () => {
    const parts = Array.from({ length: maxCompositeLogParts + 1 }, (_, i) => ({
      delimiter: `d${i}`,
    }));
    const handle = newCompositeLogHandle(true, parts);
    const parsed = parseCompositeLogHandle(handle);
    expect(parsed.parts.length).toBe(maxCompositeLogParts);
    expect(parsed.parts[0]).toEqual({ delimiter: "d1" });

    const payload = Buffer.from(JSON.stringify({ parts })).toString("base64url");
    const crafted =
      handle.slice(
        0,
        handle.length -
          Buffer.from(JSON.stringify({ parts: parsed.parts })).toString("base64url").length,
      ) + payload;
    expect(() => parseCompositeLogHandle(crafted as AnyLogHandle)).toThrow(/more than/);
  });

  test("a log without a trailing newline: the delimiter starts a new line", async () => {
    const env = await setup(rid(1));
    setCollection(env, [
      { stream: { kind: "blob", text: "root" }, outcome: rootFailed },
      { stream: { kind: "live", text: "next\n" } },
    ]);
    const handle = (await handleOf(env).getValue())!;
    expect((await readAll(env.logs, handle)).text).toBe(`root\n${rootDelimiter}next\n`);
  });
});

describe("bare StreamManager (no fallbacks) keeps today's handle", () => {
  function setManager(env: Env, kind: "live" | "blob", text: string) {
    const streamId = rid(kind === "blob" ? 12 : 11);
    env.clientLogs.logs.set(parseSignedResourceId(streamId).globalId, {
      text,
      final: kind === "blob",
    });
    env.tree.updateFromResourceData([
      resource(env.root, ManagerType, [dField("stream", streamId)]),
      resource(streamId, kind === "blob" ? BlobType : LiveStreamType),
    ]);
    return parseSignedResourceId(streamId).globalId;
  }

  test("live stream, then blob", async () => {
    const env = await setup(rid(2));
    const c = handleOf(env);

    const liveId = setManager(env, "live", "1\n");
    const live = await c.getFullValue();
    expect(live.value).toBe(`log+live://log/StreamWorkdir/main/1/${liveId}/`);
    expect(live.stable).toBe(false);
    expect(isCompositeLogHandle(live.value!)).toBe(false);
    expect(await env.logs.readText(live.value!, 100)).toMatchObject({
      live: true,
      size: 2,
      newOffset: 2,
    });

    const blobId = setManager(env, "blob", "1\n2\n");
    const ready = await c.getFullValue();
    expect(ready.value).toBe(`log+ready://log/Blob/main/1/${blobId}/`);
    expect(isCompositeLogHandle(ready.value!)).toBe(false);
    const resp = await env.logs.readText(ready.value!, 100);
    expect(decode(resp)).toBe("1\n2\n");
    expect(resp).toMatchObject({ live: false });
    expect(decode(await env.logs.lastLines(ready.value!, 1))).toBe("2\n");
  });

  test("a missing live stream still asks for a new handle", async () => {
    const env = await setup(rid(2));
    env.tree.updateFromResourceData([
      resource(env.root, ManagerType, [dField("stream", rid(11))]),
      resource(rid(11), LiveStreamType),
    ]);
    const handle = (await handleOf(env).getValue())!;
    expect(await env.logs.readText(handle, 100)).toEqual({ shouldUpdateHandle: true });
  });
});
