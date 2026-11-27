/* Streams of an exec with fallbacks (spec §13, AC2.6 old-driver view, AC2.7, AC3.3).
 *
 * The old log driver is pinned here, not taken from the middle layer: it is the
 * LogsDriver.getLogHandle / getLastLogs of before exec fallbacks in two steps, written out so a
 * driver that learns about StreamCollection/1 cannot change what this test checks:
 *   1. resolve the `stream` field of what getStdoutStream returns (logs.ts, streamManagerGetStream),
 *      here a StreamCollection whose `stream` the templates rewrite, not a StreamManager;
 *   2. a StreamWorkdir target is read live through the streaming logs API, which is what
 *      LogsStreamDriver does (logs_stream.ts, LogGetter.update); anything else is a blob.
 *
 * The collection is read through the tree accessors. Blobs are compared by content hash: the
 * local test harness cannot download blobs of an FS primary storage. */
import { Computable, type ComputableCtx } from "@milaboratories/computable";
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

/** stderr without the lines the Kubernetes job wrapper adds ("[job-script] Process exited ..."). */
const withoutJobScript = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.startsWith("[job-script]"))
    .join("\n");

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
      ["stdoutStream", "errStream", "stdoutContent", "attempts", "logs"],
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
      if (e !== undefined) errComposites.push(withoutJobScript(e.text));
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
    // the variant: stderr, which the handler leaves empty, ends with the delimiter
    expect(errComposites.some((t) => t === `root-err\n${delimiter}`)).toBe(true);

    const attempts = await result
      .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
      .awaitStableValue();
    expect(attempts).toEqual([
      { attempt: 0, plan: "root", result: "fail", reason: "SoftwareError", exitCode: 2 },
      { attempt: 1, plan: "handler", result: "success", exitCode: 0 },
    ]);

    // the handler writes nothing to stderr: its stream ends on an empty file, and nothing else of
    // the job reads as an error (spec §13.1)
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
      ["stdoutStream", "errStream", "stdoutContent", "attempts", "logs"],
      (tx) => ({
        nonce: tx.createValue(Pl.JsonObject, JSON.stringify(randomUUID())),
        seconds: tx.createValue(Pl.JsonObject, JSON.stringify(1)),
        rootExit: tx.createValue(Pl.JsonObject, JSON.stringify("0")),
        forceV2: tx.createValue(Pl.JsonObject, JSON.stringify(true)),
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

// Review 2, m7: the reverse of the stderr variant: the root wrote nothing to stderr, the handler
// did; the composite handle still ends ready, not live forever
tplTest(
  "exec fallbacks: an attempt that wrote nothing to a stream does not keep the log live",
  async ({ helper, driverKit, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.streams",
      ["stdoutStream", "errStream", "stdoutContent", "attempts", "logs"],
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
        if (handle.startsWith("log+ready://") && last?.text.includes("handler-err\n")) break;
      }
      await sleep(250);
    }
    expect(last?.handle.startsWith("log+ready://")).toBe(true);
    expect(withoutJobScript(last?.text ?? "")).toBe(`${delimiter}handler-err\n`);
  },
  180_000,
);

// Review of platforma#1948: a job that no plan can continue fails, and the collection's `stream`
// ends on the last attempt's saved file instead of staying on its dead live stream
tplTest(
  "exec fallbacks: a failed job's stream ends on the last attempt's file",
  async ({ helper, driverKit, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.stream_of_failed_job",
      ["stdoutStream", "attempts"],
      (tx) => ({
        nonce: tx.createValue(Pl.JsonObject, JSON.stringify(randomUUID())),
      }),
    );

    // every output of the job is an error, and so is the result map holding them: read the
    // stream past it
    const stdoutStream = <R>(cb: (a: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => R) =>
      Computable.make((ctx) =>
        cb(
          ctx
            .accessor(result.resultEntry)
            .node({ ignoreError: true })
            .traverse({ field: "stdoutStream", assertFieldType: "Input", ignoreError: true }),
          ctx,
        ),
      );
    const attempts = await result
      .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
      .awaitStableValue()
      .catch((e: Error) => e);
    expect(attempts).toBeInstanceOf(Error);
    expect((attempts as Error).message).toContain("#1 handler fail SoftwareError (exit 3)");

    // what an old driver and getLastLogs read: `stream`, and the history entries
    const read = (a: PlTreeNodeAccessor | undefined) => ({
      stream: node(a?.traverse({ field: "stream", ignoreError: true })),
      outcome0: node(a?.traverse({ field: "outcome0", ignoreError: true })).json,
      outcome1: node(a?.traverse({ field: "outcome1", ignoreError: true })).json,
      attempt0Stream: node(a?.traverse("attempt0", "stream")),
      attempt1Stream: node(a?.traverse("attempt1", "stream")),
    });
    const deadline = Date.now() + 60_000;
    let state: ReturnType<typeof read> | undefined;
    while (Date.now() < deadline) {
      state = await stdoutStream((a) => read(a)).getValue();
      if (state?.stream.hash && state.outcome1 !== undefined && state.attempt0Stream.hash) break;
      await sleep(250);
    }
    expect(state?.outcome1).toEqual({
      attempt: 1,
      plan: "handler",
      result: "fail",
      reason: "SoftwareError",
      exitCode: 3,
    });
    // `stream` ends on attempt 1's saved file, as for a winner, not on its live stream
    expect(state?.stream.type).toMatch(/^Blob/);
    expect(state?.stream.hash).toBe(createHash("sha256").update("fallback-1\n").digest("hex"));
    // each attempt's manager ends on its own file, not on an error
    expect(state?.attempt0Stream.hash).toBe(createHash("sha256").update("root\n").digest("hex"));
    expect(state?.attempt1Stream.hash).toBe(state?.stream.hash);

    // the current driver: the composite log of a failed job, read as a viewer reads it
    let composite: { handle: string; text: string } | string | undefined;
    while (Date.now() < deadline) {
      composite = await stdoutStream((a, ctx) => {
        const entry = a?.persist();
        return entry === undefined ? undefined : driverKit.logDriver.getLogHandle(entry, ctx);
      })
        .getValue()
        .then(async (handle) => {
          if (handle === undefined) return undefined;
          const resp = await driverKit.logDriver.readText(handle, 1000);
          return resp.shouldUpdateHandle
            ? undefined
            : { handle, text: new TextDecoder().decode(resp.data) };
        })
        .catch((e: Error) => `error: ${e.message.slice(0, 200)}`);
      if (typeof composite === "string" || composite?.handle.startsWith("log+ready://")) break;
      await sleep(250);
    }
    expect(typeof composite).toBe("object");
    const ready = typeof composite === "object" ? composite : undefined;
    expect(ready?.handle.startsWith("log+ready://")).toBe(true);
    expect(ready?.text).toContain(
      "root\n--- attempt 0 (root) failed: SoftwareError, exit code 2 ---\nfallback-1\n",
    );
  },
  120_000,
);

// Review 2, m1: on RunCommand v2 getAttempts() follows the run: a failed run has no attempts
tplTest(
  "AC3.3 exec fallbacks: without RunCommand v3, a failed run's getAttempts() is an error",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.streams",
      ["stdoutStream", "errStream", "stdoutContent", "attempts", "logs"],
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

// Review 4 m3, review 5 m2/T1: a failed attempt's streamed file that cannot be saved (the root
// replaces stderr.txt with a broken symlink) loses that attempt's log only, on a backend with
// WorkdirSave v3; the successful fallback's outputs resolve, and every stream ends on the winner's
// final content
tplTest(
  "exec fallbacks: a failed attempt's unsaveable stream does not fail the fallback",
  async ({ helper, driverKit, expect, skip }) => {
    const capability = await helper.renderTemplate(
      false,
      "exec.fallback.capability",
      ["workdirSaveV3"],
      () => ({}),
    );
    const v3 = await capability
      .computeOutput("workdirSaveV3", (a) => a?.getDataAsJson<boolean>())
      .awaitStableValue();
    // without WorkdirSave v3 such a failure spreads to the job's outputs (decision D9)
    if (!v3) return skip("no WorkdirSave v3 on the backend");

    const result = await helper.renderTemplate(
      false,
      "exec.fallback.streams",
      ["stdoutStream", "errStream", "stdoutContent", "attempts"],
      (tx) => ({
        nonce: tx.createValue(Pl.JsonObject, JSON.stringify(randomUUID())),
        seconds: tx.createValue(Pl.JsonObject, JSON.stringify(1)),
        rootBadStream: tx.createValue(Pl.JsonObject, JSON.stringify(true)),
      }),
    );
    const content = await result
      .computeOutput("stdoutContent", (a) => a?.getDataAsString())
      .awaitStableValue();
    expect(content).toBe("fallback-1\n");
    const attempts = await result
      .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
      .awaitStableValue();
    expect(attempts?.map((a) => a.plan)).toEqual(["root", "handler"]);

    // stderr: the root's could not be saved, the handler's is empty. The collection's `stream`
    // ends on the winner's file, not on a live tail; the composite log is the delimiter only, and
    // ready
    const deadline = Date.now() + 60_000;
    let state: ReturnType<typeof streamState> | undefined;
    let composite: { handle: string; text: string } | undefined;
    while (Date.now() < deadline) {
      state = await result.computeOutput("errStream", (a) => streamState(a)).getValue();
      const handle = await result
        .computeOutput("errStream", (a, ctx) => {
          const entry = a?.persist();
          return entry === undefined ? undefined : driverKit.logDriver.getLogHandle(entry, ctx);
        })
        .getValue();
      if (handle !== undefined) {
        const resp = await driverKit.logDriver.readText(handle, 1000);
        if (!resp.shouldUpdateHandle)
          composite = { handle, text: new TextDecoder().decode(resp.data) };
      }
      if (state?.stream.hash && composite?.handle.startsWith("log+ready://")) break;
      await sleep(250);
    }
    // the handler's stderr: empty, or the job wrapper's lines on Kubernetes
    expect(state?.stream.type).toMatch(/^Blob/);
    expect(state?.attempt0Stream.json).toEqual({ streamFileNotWritten: "stderr.txt" });
    expect(composite?.handle.startsWith("log+ready://")).toBe(true);
    expect(withoutJobScript(composite?.text ?? "")).toBe(
      "--- attempt 0 (root) failed: SoftwareError, exit code 2 ---\n",
    );
  },
  120_000,
);
