/* Streams of an exec with fallbacks (spec §13, AC2.6 old-driver view, AC2.7, AC3.3).
 *
 * The old log driver is pinned here, not taken from the middle layer: it is the
 * LogsDriver.getLogHandle / getLastLogs of before exec fallbacks in two steps, written out so a
 * driver that learns about StreamCollection/1 cannot change what this test checks:
 *   1. resolve the `stream` field of what getFileStream returns (logs.ts, streamManagerGetStream),
 *      here a StreamCollection whose `stream` the templates rewrite, not a StreamManager;
 *   2. a StreamWorkdir target is read live through the streaming logs API, which is what
 *      LogsStreamDriver does (logs_stream.ts, LogGetter.update); anything else is a blob.
 *
 * The collection is read through the tree accessors. Blobs are compared by content hash: the
 * local test harness cannot download blobs of an FS primary storage. */
import { ConsoleLoggerAdapter } from "@milaboratories/helpers";
import { createLogsClient } from "@milaboratories/pl-drivers";
import { Pl } from "@milaboratories/pl-middle-layer";
import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { tplTest } from "@platforma-sdk/test";
import { createHash, randomUUID } from "node:crypto";

type Sample = { kind: "none" | "live" | "blob"; text?: string };
type Attempt = {
  attempt: number;
  plan: string;
  result: string;
  reason?: string;
  exitCode?: number;
};

/** What a field of a resource points at: its type, its blob hash, its JSON. */
type Node = { type?: string; hash?: string; json?: unknown };

function node(a: PlTreeNodeAccessor | undefined): Node {
  if (a === undefined) return {};
  const text = a.getDataAsString();
  let parsed: unknown;
  try {
    parsed = text === undefined || text === "" ? undefined : JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  const hash = (parsed as { hashValue?: string } | undefined)?.hashValue;
  return { type: a.resourceType.name + ":" + a.resourceType.version, hash, json: parsed };
}

/** The collection (or manager) of a stream output, with what its fields point at. */
function streamState(a: PlTreeNodeAccessor | undefined) {
  return {
    self: node(a),
    dynamic: a?.listDynamicFields() ?? [],
    stream: node(a?.traverse("stream")),
    attempt0: node(a?.traverse("attempt0")),
    attempt0Stream: node(a?.traverse("attempt0", "stream")),
    attempt1: node(a?.traverse("attempt1")),
    attempt1Stream: node(a?.traverse("attempt1", "stream")),
    outcome0: node(a?.traverse("outcome0")).json,
    outcome1: node(a?.traverse("outcome1")).json,
  };
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// forceSaveV1: a backend with RunCommand v3 but without WorkdirSave v3 (the _forceWorkdirSaveV1
// seam): the streams behave the same.
tplTest.for([{ forceSaveV1: false }, { forceSaveV1: true }])(
  "AC2.6/AC2.7 exec fallbacks: the stream follows the running attempt, each attempt ends on its own file (forceSaveV1: $forceSaveV1)",
  async ({ forceSaveV1 }, { pl, helper, driverKit, expect }) => {
    const logsClient = createLogsClient(pl, new ConsoleLoggerAdapter());

    // the current driver: the composite handle of a collection, read as a viewer reads it
    const composite = async (output: "stdoutStream" | "errStream") => {
      const handle = await result
        .computeOutput(output, (a, ctx) => {
          const entry = a?.persist();
          return entry === undefined ? undefined : driverKit.logDriver.getLogHandle(entry, ctx);
        })
        .getValue();
      if (handle === undefined) return undefined;
      const resp = await driverKit.logDriver.readText(handle, 1000);
      if (resp.shouldUpdateHandle) return undefined;
      return { handle, text: new TextDecoder().decode(resp.data) };
    };
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.streams",
      ["stdoutStream", "errStream", "infoStream", "stdoutContent", "attempts", "logs"],
      (tx) => ({
        nonce: tx.createValue(Pl.JsonObject, JSON.stringify(randomUUID())),
        seconds: tx.createValue(Pl.JsonObject, JSON.stringify(10)),
        forceSaveV1: tx.createValue(Pl.JsonObject, JSON.stringify(forceSaveV1)),
      }),
    );

    // the pinned old driver: what `stream` points at right now, and its text
    const sample = async (): Promise<Sample> => {
      const info = await result
        .computeOutput("stdoutStream", (a) => a?.traverse("stream")?.resourceInfo)
        .getValue();
      if (info === undefined) return { kind: "none" };
      if (!info.type.name.startsWith("StreamWorkdir")) return { kind: "blob" };
      const resp = await logsClient.lastLines(info, 100, 0n);
      return { kind: "live", text: new TextDecoder().decode(resp.data) };
    };

    const samples: Sample[] = [];
    const composites: string[] = [];
    const errComposites: string[] = [];
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const s = await sample().catch((): Sample => ({ kind: "none" }));
      samples.push(s);
      const c = await composite("stdoutStream").catch(() => undefined);
      if (c !== undefined) composites.push(c.text);
      const e = await composite("errStream").catch(() => undefined);
      if (e !== undefined) errComposites.push(e.text);
      if (s.kind === "blob") break;
      await sleep(250);
    }
    const live = samples.filter((s) => s.kind === "live").map((s) => s.text ?? "");

    // AC2.6, old desktop: attempt 0 live, then only the handler's lines live, then a blob
    expect(live.some((t) => t.includes("root") && !t.includes("fallback-"))).toBe(true);
    const firstFallback = live.findIndex((t) => t.includes("fallback-"));
    expect(firstFallback).toBeGreaterThan(0);
    const afterSwitch = live.slice(firstFallback);
    expect(afterSwitch.some((t) => t.includes("root"))).toBe(false);
    expect(afterSwitch.length).toBeGreaterThan(1); // followed while running, not only at the end
    expect(samples[samples.length - 1]?.kind).toBe("blob");

    // AC2.6, current desktop: while the handler runs, attempt 0's text, the delimiter naming it,
    // then the handler's lines so far
    const delimiter = "--- attempt 0 (root) failed: SoftwareError, exit code 2 ---\n";
    expect(composites.some((t) => t.startsWith(`root\n${delimiter}fallback-1\n`))).toBe(true);
    expect(composites.some((t) => t.includes("root") && !t.includes("fallback-"))).toBe(true);
    // the variant: err.log, which the handler never writes, ends with the delimiter
    expect(errComposites.some((t) => t === `root-err\n${delimiter}`)).toBe(true);

    const attempts = await result
      .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
      .awaitStableValue();
    expect(attempts).toEqual([
      { attempt: 0, plan: "root", result: "fail", reason: "SoftwareError", exitCode: 2 },
      { attempt: 1, plan: "handler", result: "success", exitCode: 0 },
    ]);

    // the handler never writes err.log: its stream ends on an empty live stream, and nothing
    // else of the job reads as an error (spec §13.1)
    const logs = await result
      .computeOutput("logs", (a) => ({
        fields: a?.listInputFields(),
        type: a?.traverse("stdout.txt")?.resourceType.name,
      }))
      .awaitStableValue();
    expect(logs?.fields).toEqual(["stdout.txt"]);
    expect(logs?.type).toMatch(/^Blob/);
    // a collection is never final: read it once, not until stable
    const errStream = await result
      .computeOutput("errStream", (a) => a?.resourceType.name)
      .getValue();
    expect(errStream).toBe("StreamCollection");

    // AC2.7: the collection after success
    const expected = Array.from({ length: 10 }, (_, i) => `fallback-${i + 1}\n`).join("");
    const content = await result
      .computeOutput("stdoutContent", (a) => a?.getDataAsString())
      .awaitStableValue();
    expect(content).toBe(expected);

    let state = undefined as ReturnType<typeof streamState> | undefined;
    while (Date.now() < deadline) {
      state = await result.computeOutput("stdoutStream", (a) => streamState(a)).getValue();
      if (state?.attempt0Stream.hash && state.attempt1Stream.hash && state.stream.hash) break;
      await sleep(250);
    }

    expect(state?.self.type).toBe("StreamCollection:1");
    expect(state?.attempt0.type).toBe("StreamManager:2");
    expect(state?.attempt1.type).toBe("StreamManager:2");
    expect(state?.dynamic).not.toContain("attempt2");
    // attempt 0's own file reads "root", attempt 1's is the ten handler lines
    expect(state?.attempt0Stream.hash).toBe(createHash("sha256").update("root\n").digest("hex"));
    expect(state?.attempt1Stream.hash).toBe(createHash("sha256").update(expected).digest("hex"));
    // `stream` ends on the winner's file
    expect(state?.stream.hash).toBe(state?.attempt1Stream.hash);
    expect(state?.outcome0).toEqual({
      attempt: 0,
      plan: "root",
      result: "fail",
      reason: "SoftwareError",
      exitCode: 2,
    });
    // after success, the same text from the attempts' files
    let final: { handle: string; text: string } | undefined;
    while (Date.now() < deadline) {
      final = await composite("stdoutStream").catch(() => undefined);
      if (final?.handle.startsWith("log+ready://")) break;
      await sleep(250);
    }
    expect(final?.handle.startsWith("log+ready://")).toBe(true);
    expect(final?.text).toBe(`root\n${delimiter}${expected}`);

    expect(state?.outcome1).toEqual({
      attempt: 1,
      plan: "handler",
      result: "success",
      exitCode: 0,
    });
  },
  240_000,
);

tplTest(
  "AC3.3 exec fallbacks: without RunCommand v3, getAttempts() resolves and the stream is a bare manager",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.streams",
      ["stdoutStream", "errStream", "infoStream", "stdoutContent", "attempts", "logs"],
      (tx) => ({
        nonce: tx.createValue(Pl.JsonObject, JSON.stringify(randomUUID())),
        seconds: tx.createValue(Pl.JsonObject, JSON.stringify(1)),
        rootExit: tx.createValue(Pl.JsonObject, JSON.stringify("0")),
        forceV2: tx.createValue(Pl.JsonObject, JSON.stringify(true)),
        // a streamed file never saved never resolves on the v2 path, as before fallbacks
        errLog: tx.createValue(Pl.JsonObject, JSON.stringify(false)),
      }),
    );

    const attempts = await result
      .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
      .awaitStableValue();
    expect(attempts).toEqual([{ attempt: 0, plan: "root", result: "success" }]);

    const content = await result
      .computeOutput("stdoutContent", (a) => a?.getDataAsString())
      .awaitStableValue();
    expect(content).toBe("root\n");

    const state = await result.computeOutput("stdoutStream", (a) => streamState(a)).getValue();
    expect(state?.self.type).toBe("StreamManager:2");
  },
  120_000,
);

// Review 2, m7: the reverse of the err.log variant: the root never wrote the file, the handler
// did; the composite handle still ends ready, not live forever
tplTest(
  "exec fallbacks: an attempt that never wrote a streamed file does not keep the log live",
  async ({ helper, driverKit, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.streams",
      ["stdoutStream", "errStream", "infoStream", "stdoutContent", "attempts", "logs"],
      (tx) => ({
        nonce: tx.createValue(Pl.JsonObject, JSON.stringify(randomUUID())),
        seconds: tx.createValue(Pl.JsonObject, JSON.stringify(1)),
        errLogByHandler: tx.createValue(Pl.JsonObject, JSON.stringify(true)),
      }),
    );
    const delimiter = "--- attempt 0 (root) failed: SoftwareError, exit code 2 ---\n";
    const deadline = Date.now() + 120_000;
    let last: { handle: string; text: string } | undefined;
    while (Date.now() < deadline) {
      const handle = await result
        .computeOutput("errStream", (a, ctx) => {
          const entry = a?.persist();
          return entry === undefined ? undefined : driverKit.logDriver.getLogHandle(entry, ctx);
        })
        .getValue()
        .catch(() => undefined);
      if (handle !== undefined) {
        const resp = await driverKit.logDriver.readText(handle, 1000);
        if (!resp.shouldUpdateHandle) last = { handle, text: new TextDecoder().decode(resp.data) };
        if (handle.startsWith("log+ready://") && last?.text.endsWith("handler-err\n")) break;
      }
      await sleep(250);
    }
    expect(last?.handle.startsWith("log+ready://")).toBe(true);
    expect(last?.text).toBe(`${delimiter}handler-err\n`);
  },
  180_000,
);

// Review 2, m1: on RunCommand v2 getAttempts() follows the run: a failed run has no attempts
tplTest(
  "AC3.3 exec fallbacks: without RunCommand v3, a failed run's getAttempts() is an error",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.streams",
      ["stdoutStream", "errStream", "infoStream", "stdoutContent", "attempts", "logs"],
      (tx) => ({
        nonce: tx.createValue(Pl.JsonObject, JSON.stringify(randomUUID())),
        seconds: tx.createValue(Pl.JsonObject, JSON.stringify(1)),
        rootExit: tx.createValue(Pl.JsonObject, JSON.stringify("1")),
        forceV2: tx.createValue(Pl.JsonObject, JSON.stringify(true)),
        errLog: tx.createValue(Pl.JsonObject, JSON.stringify(false)),
      }),
    );
    const attempts = await result
      .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
      .awaitStableValue()
      .catch((e: Error) => e);
    expect(attempts).toBeInstanceOf(Error);
    expect((attempts as Error).message).toContain("Exited with code 1.");
  },
  120_000,
);

// Review 3, m1: streamFile without saveFile. Before fallbacks the stream stayed live forever; a
// manager may not reference a live stream as its final content, so it ends on the stand-in for a
// file without a final content, which the current log driver reads as no log
tplTest(
  "exec fallbacks: a streamed file that is not saved ends on the stand-in after success",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.streams",
      ["stdoutStream", "errStream", "infoStream", "stdoutContent", "attempts"],
      (tx) => ({
        nonce: tx.createValue(Pl.JsonObject, JSON.stringify(randomUUID())),
        seconds: tx.createValue(Pl.JsonObject, JSON.stringify(1)),
        errLog: tx.createValue(Pl.JsonObject, JSON.stringify(false)),
        streamOnly: tx.createValue(Pl.JsonObject, JSON.stringify(true)),
      }),
    );
    await result.computeOutput("stdoutContent", (a) => a?.getDataAsString()).awaitStableValue();
    const deadline = Date.now() + 60_000;
    let state: ReturnType<typeof streamState> | undefined;
    while (Date.now() < deadline) {
      state = await result.computeOutput("infoStream", (a) => streamState(a)).getValue();
      if (state?.attempt1Stream.type?.startsWith("json")) break;
      await sleep(250);
    }
    expect(state?.attempt1Stream.json).toEqual({ streamFileNotWritten: "info.log" });
  },
  120_000,
);

// Review 4, m3: a failed attempt's streamed file that cannot be saved (a broken symlink) loses
// that attempt's log only; the successful fallback's outputs resolve
tplTest(
  "exec fallbacks: a failed attempt's unsaveable stream does not fail the fallback",
  async ({ helper, expect, skip }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.streams",
      ["stdoutStream", "errStream", "infoStream", "stdoutContent", "attempts"],
      (tx) => ({
        nonce: tx.createValue(Pl.JsonObject, JSON.stringify(randomUUID())),
        seconds: tx.createValue(Pl.JsonObject, JSON.stringify(1)),
        rootBadStream: tx.createValue(Pl.JsonObject, JSON.stringify(true)),
      }),
    );
    const content = await result
      .computeOutput("stdoutContent", (a) => a?.getDataAsString())
      .awaitStableValue()
      .catch((e: Error) => e);
    // without WorkdirSave v3 the failed attempt's log save cannot be checked first: as before
    if (content instanceof Error && !content.message.includes("not a regular file")) throw content;
    if (content instanceof Error) return skip("no WorkdirSave v3 on the backend");
    expect(content).toBe("fallback-1\n");
    const attempts = await result
      .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
      .awaitStableValue();
    expect(attempts?.map((a) => a.plan)).toEqual(["root", "handler"]);
  },
  120_000,
);
