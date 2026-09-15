import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openRecorder, listSessions, type Recorder } from "./recorder";
import { readCrashMarkers, writeCrashMarker } from "./supervisor";
import { analyzeLatest, analyzeSession } from "./analyze";
import {
  createHandleRegistry,
  recordModelRender,
  recordModelRenderSync,
  wrapDataDriver,
  wrapModelDriver,
} from "./instrument";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "flight-test-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("crash detection", () => {
  test("a session with no terminating record is reported as crashed", () => {
    const recorder = openRecorder({ dir, meta: { appVersion: "test" } });
    recorder.event("getShape-begin", { handle: "t1" });
    // Deliberately not closed: this is what a killed process leaves behind.

    const sessions = listSessions(dir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].crashed).toBe(true);

    const analysis = analyzeSession(sessions[0].file, dir);
    expect(analysis.crashed).toBe(true);
    expect(analysis.inFlightAtDeath?.op).toBe("getShape");
  });

  test("a closed session is reported as clean and has nothing in flight", () => {
    const recorder = openRecorder({ dir });
    recorder.event("getShape-begin", { handle: "t1" });
    recorder.event("getShape-end", { begin: 2, rows: 10, columns: 2 });
    recorder.close();

    const analysis = analyzeLatest(dir, { preferCrashed: false })!;
    expect(analysis.crashed).toBe(false);
    expect(analysis.inFlight).toEqual([]);
    expect(analysis.inFlightAtDeath).toBeUndefined();
  });

  test("the innermost unfinished operation is the smoking gun", () => {
    const recorder = openRecorder({ dir });
    recorder.event("render-begin", { blockId: "block-7" });
    recorder.event("getShape-begin", { handle: "t1" });
    recorder.event("getShape-end", { begin: 3 });
    recorder.event("getData-begin", { handle: "t1", unbounded: true, tableRows: 5_000_000 });

    const analysis = analyzeLatest(dir)!;
    expect(analysis.inFlight.map((op) => op.op)).toEqual(["render", "getData"]);
    expect(analysis.inFlightAtDeath?.op).toBe("getData");
    // The call's own fields travel with it, so what it asked for is readable
    // without the analysis having to characterise it.
    expect(analysis.inFlightAtDeath?.info).toMatchObject({ unbounded: true, tableRows: 5_000_000 });
    expect(analysis.inFlightAtDeath?.block).toBe("block-7");
  });
});

describe("memory readings", () => {
  test("the supervisor's reason for the death is carried through unaltered", () => {
    const recorder = openRecorder({ dir });
    recorder.event("getData-begin", { handle: "t1" });
    writeCrashMarker(dir, {
      error: Object.assign(new Error("Worker terminated due to reaching memory limit"), {
        code: "ERR_WORKER_OUT_OF_MEMORY",
      }),
    });

    const analysis = analyzeSession(recorder.file, dir);
    expect(analysis.crashMarker?.reason).toBe("js-heap-out-of-memory");
    expect(analysis.crashMarker?.errorCode).toBe("ERR_WORKER_OUT_OF_MEMORY");
  });

  test("the marker carries memory, so a bare exit code cannot be read as a clean failure", () => {
    const recorder = openRecorder({ dir });
    recorder.event("getShape-begin", { handle: "t1" });
    writeCrashMarker(dir, { reason: "worker-exit", code: 1, sessionId: recorder.sessionId });

    const { crashMarker } = analyzeSession(recorder.file, dir);
    // On its own `worker-exit` with exit code 1 looks like an ordinary error;
    // the reading taken beside it is what says whether memory was the reason.
    expect(crashMarker?.reason).toBe("worker-exit");
    expect(crashMarker?.memoryAtDeath?.rss).toBeGreaterThan(0);
    expect(crashMarker?.memoryAtDeath?.totalMemory).toBeGreaterThan(0);
    expect(crashMarker?.memoryAtDeath?.maxRss).toBeGreaterThanOrEqual(
      crashMarker?.memoryAtDeath?.rss ?? 0,
    );
  });

  test("the peak and the worst free reading are kept, not only the last sample", () => {
    // What an OS under pressure produces: the process is reclaimed back down, so
    // the final reading is comfortable while the machine never was.
    const sessionId = seedSession(dir, [
      { rss: 2 * 1024 ** 3, freeMemory: 20 * 1024 ** 3 },
      { rss: 40 * 1024 ** 3, freeMemory: 1024 * 1024 },
      { rss: 4 * 1024 ** 3, freeMemory: 18 * 1024 ** 3 },
    ]);
    const { memory } = analyzeSession(path.join(dir, `flight-${sessionId}.ndjson`), dir);
    expect(memory.peakRss).toBe(40 * 1024 ** 3);
    expect(memory.rssAtDeath).toBe(4 * 1024 ** 3);
    expect(memory.minFreeMemory).toBe(1024 * 1024);
    // The gap between the peak and the end is what a falling curve hides.
    expect(memory.rssReleasedFromPeak).toBe(36 * 1024 ** 3);
  });
});

describe("what was asked for", () => {
  test("a join's own size is measured and reported next to the memory spent", () => {
    const recorder = openRecorder({ dir });
    const modelDriver = wrapModelDriver(fakeModelDriver(), recorder, createHandleRegistry());
    // 32,345 rows a side over a shared axis: 1,046,199,025 rows of 2 String axes
    // and 2 Int values.
    modelDriver.createPTable(fanOutDef(32_345));
    writeSampler(dir, recorder.sessionId, [
      { rss: 512 * 1024 ** 2, freeMemory: 30 * 1024 ** 3 },
      { rss: 18 * 1024 ** 3, freeMemory: 1024 ** 3 },
    ]);

    const { requestedSize } = analyzeSession(recorder.file, dir);
    expect(requestedSize.requestedRows).toBe(32_345 * 32_345);
    expect(requestedSize.floorBytes).toBeLessThan(requestedSize.ceilingBytes ?? 0);
    expect(requestedSize.observedBytes).toBeGreaterThan(17 * 1024 ** 3);
    // The axes are reported so a reader can see why the join replicates; no
    // conclusion about the size is drawn for them.
    expect(requestedSize.sharedAxes).toEqual(["shared"]);
    expect(requestedSize.unsharedAxes).toEqual(["left", "right"]);
    expect(requestedSize).not.toHaveProperty("owner");
  });

  test("a definition too small to explain the memory is still only measured", () => {
    const recorder = openRecorder({ dir });
    const modelDriver = wrapModelDriver(fakeModelDriver(), recorder, createHandleRegistry());
    modelDriver.createPTable(fanOutDef(100));
    writeSampler(dir, recorder.sessionId, [
      { rss: 512 * 1024 ** 2, freeMemory: 30 * 1024 ** 3 },
      { rss: 18 * 1024 ** 3, freeMemory: 1024 ** 3 },
    ]);

    const { requestedSize } = analyzeSession(recorder.file, dir);
    expect(requestedSize.requestedRows).toBe(10_000);
    // Four orders of magnitude apart, and the report still says only that.
    expect(requestedSize.ceilingBytes).toBeLessThan(requestedSize.observedBytes / 1000);
    expect(requestedSize.unavailable).toBeUndefined();
  });

  test("a session with no definition says the size was not established", () => {
    const recorder = openRecorder({ dir });
    recorder.event("getShape-begin", { handle: "t1" });
    writeSampler(dir, recorder.sessionId, [{ rss: 18 * 1024 ** 3, freeMemory: 1024 ** 3 }]);

    const { requestedSize } = analyzeSession(recorder.file, dir);
    expect(requestedSize.requestedRows).toBeUndefined();
    expect(requestedSize.unavailable).toContain("no join definition");
  });
});

describe("which code was running", () => {
  test("a block id is written out once into what it actually is", () => {
    const recorder = openRecorder({ dir });
    const identity = {
      blockId: "b1",
      block: "milaboratories:clonotype-table",
      blockVersion: "2.4.1",
      blockSource: "from-registry-v2",
      sdkVersion: "1.83.9",
    };
    // Rendered repeatedly, as a block is: the identity is written once.
    for (let i = 0; i < 5; i++) {
      recordModelRenderSync(recorder, { ...identity, lambda: "title" }, () => undefined);
    }

    const analysis = analyzeSession(recorder.file, dir);
    expect(analysis.blocks.b1).toEqual({
      block: "milaboratories:clonotype-table",
      blockVersion: "2.4.1",
      blockSource: "from-registry-v2",
      sdkVersion: "1.83.9",
    });
    const announcements = analysis.timeline.filter((record) => record.type === "block");
    expect(announcements.length).toBeLessThanOrEqual(1);
  });

  test("a long session does not outlive the legend for its own block ids", () => {
    const recorder = openRecorder({ dir, maxFileBytes: 1800 });
    recordModelRenderSync(
      recorder,
      {
        blockId: "b1",
        block: "milaboratories:clonotype-table",
        blockVersion: "2.4.1",
        sdkVersion: "1.83.9",
      },
      () => undefined,
    );
    // Rotated until the segment holding the original announcement is gone.
    rotateUntilEarliestSegmentLost(recorder);

    const analysis = analyzeSession(recorder.file, dir);
    expect(analysis.rotations).toBeGreaterThan(1);
    // Without carrying it forward every block id in what survives would be
    // unresolvable — which is the whole of the identity being lost.
    expect(analysis.blocks.b1?.block).toBe("milaboratories:clonotype-table");
    expect(analysis.blocks.b1?.blockVersion).toBe("2.4.1");
  });

  test("a driver call made inside a render carries the block that made it", () => {
    const recorder = openRecorder({ dir });
    const modelDriver = wrapModelDriver(fakeModelDriver(), recorder, createHandleRegistry());
    recordModelRenderSync(recorder, { blockId: "b1", block: "org:b" }, () => {
      modelDriver.createPTable(inlineFanOutDef(10, 1));
    });

    const { attribution } = analyzeSession(recorder.file, dir);
    const created = attribution.find((op) => op.op === "createPTable");
    expect(created?.block).toBe("b1");
    // Written while the render ran, not reconstructed from sequence numbers.
    expect(created?.blockFrom).toBe("recorded");
  });

  test("a call made after every render has returned inherits the block from its table", () => {
    const recorder = openRecorder({ dir });
    const registry = createHandleRegistry();
    const modelDriver = wrapModelDriver(fakeModelDriver(), recorder, registry);
    let handle = "";
    recordModelRenderSync(recorder, { blockId: "b1", block: "org:b" }, () => {
      handle = modelDriver.createPTable(inlineFanOutDef(10, 1)) as string;
    });
    // What the block's UI does: it asks for the shape long after the render that
    // built the table is over, so nothing encloses the call.
    const origin = registry.get(handle);
    recorder.event("getShape-begin", { handle, joinSeq: origin?.seq });

    const { inFlightAtDeath } = analyzeSession(recorder.file, dir);
    expect(inFlightAtDeath?.op).toBe("getShape");
    expect(inFlightAtDeath?.block).toBe("b1");
    expect(inFlightAtDeath?.blockFrom).toBe("creating-call");
  });
});

describe("how large the join really is", () => {
  test("a single shared group makes the bound the answer, not a ceiling", () => {
    const recorder = openRecorder({ dir });
    const modelDriver = wrapModelDriver(fakeModelDriver(), recorder, createHandleRegistry());
    // The shape the client crashed on: both sides keyed on one constant axis, so
    // every record on one side meets every record on the other.
    modelDriver.createPTable(inlineFanOutDef(200, 1));

    const { requestedSize } = analyzeSession(recorder.file, dir);
    expect(requestedSize.requestedRows).toBe(200 * 200);
    expect(requestedSize.sharedAxisCardinality).toEqual([1]);
    // One group, so the worst case and the even spread are the same number.
    expect(requestedSize.rowsIfEvenlySpread).toBe(200 * 200);
  });

  test("many groups separate what a join could produce from what it will", () => {
    const recorder = openRecorder({ dir });
    const modelDriver = wrapModelDriver(fakeModelDriver(), recorder, createHandleRegistry());
    modelDriver.createPTable(inlineFanOutDef(200, 50));

    const { requestedSize } = analyzeSession(recorder.file, dir);
    expect(requestedSize.requestedRows).toBe(200 * 200);
    expect(requestedSize.sharedAxisCardinality).toEqual([50]);
    expect(requestedSize.rowsIfEvenlySpread).toBe(800);
  });
});

describe("log legibility", () => {
  test("the definition measured is the one the process was carrying", () => {
    const recorder = openRecorder({ dir });
    const modelDriver = wrapModelDriver(fakeModelDriver(), recorder, createHandleRegistry());
    // What a user adjusting a size control produces: the same join re-recorded at
    // every intermediate value.
    for (const rows of [30, 300, 3_000]) modelDriver.createPTable(fanOutDef(rows));

    const { requestedSize } = analyzeSession(recorder.file, dir);
    expect(requestedSize.requestedRows).toBe(3_000 * 3_000);
  });

  test("the tail keeps operations when the session ends inside a long native call", () => {
    const recorder = openRecorder({ dir });
    recorder.event("render-begin", { blockId: "b1" });
    recorder.event("getShape-begin", { handle: "t1" });
    // A blocking native call writes nothing of its own; only the sampler keeps
    // going, and it writes far more records than the tail is long.
    for (let i = 0; i < 60; i++) recorder.event("mem-self", recorder.memorySnapshot());

    const analysis = analyzeSession(recorder.file, dir);
    const types = analysis.timeline.map((record) => record.type);
    expect(types).toContain("getShape-begin");
    expect(types).not.toContain("mem-self");
  });
});

describe("instrumentation through to the report", () => {
  test("a cross join followed by an unbounded fetch is attributed to its block", async () => {
    const recorder = openRecorder({ dir, meta: { appVersion: "1.42.0" } });
    const registry = createHandleRegistry();

    const modelDriver = wrapModelDriver(fakeModelDriver(), recorder, registry);
    const dataDriver = wrapDataDriver(
      {
        getShape: async (_handle: string) => ({ rows: 921_600_000, columns: 2 }),
        getData: async (
          _handle: string,
          _columnIndices: number[],
          _range?: { offset: number; length: number },
        ) => [{ type: "String", data: ["x"] }],
        calculateTableData: async (_handle: string, _request: unknown) => [],
      },
      recorder,
      registry,
    );

    await recordModelRender(
      recorder,
      { blockId: "block-clonotype-table-7", getStats: () => ({ serOutBytes: 1_204_880 }) },
      async () => {
        const handle = modelDriver.createPTable(crossJoinDef());
        await dataDriver.getShape(handle);
        await dataDriver.getData(handle, [0, 1], undefined);
      },
    );

    const analysis = analyzeSession(recorder.file, dir);
    expect(analysis.renders[0].blockId).toBe("block-clonotype-table-7");
    expect(analysis.renders[0].stats?.serOutBytes).toBe(1_204_880);

    // The join the failing handle came from is the one measured, and the sides
    // share no axis at all, which is why the product is what it is.
    expect(analysis.requestedSize.requestedRows).toBe(921_600_000);
    expect(analysis.requestedSize.sharedAxes).toEqual([]);
    // Every driver call is tied to the render it was made under.
    for (const op of analysis.attribution.concat(analysis.inFlight)) {
      expect(op.block).toBe("block-clonotype-table-7");
    }
  });

  test("an unfinished getUniqueValues is the operation in flight", async () => {
    const recorder = openRecorder({ dir });
    const dataDriver = wrapDataDriver(
      {
        getShape: async (_handle: string) => ({ rows: 1, columns: 1 }),
        getData: async (_handle: string, _columnIndices: number[]) => [],
        calculateTableData: async (_handle: string, _request: unknown) => [],
        // Stands in for the engine dying mid-call: the promise never settles,
        // so no end record is ever written.
        getUniqueValues: (_handle: string, _request: unknown) => new Promise<never>(() => {}),
        findColumns: async (_handle: string, _request: unknown) => ({ hits: [] }),
      },
      recorder,
      createHandleRegistry(),
    );
    const secret = "CASSLGQGAETQYF";
    void dataDriver.getUniqueValues("t1", {
      columnId: "col",
      axis: { type: "String", name: "pl7.app/vdj/clonotypeKey" },
      filters: [{ predicate: { operator: "Equal", reference: secret } }],
    });
    await new Promise((resolve) => setImmediate(resolve));

    const analysis = analyzeSession(recorder.file, dir);
    expect(analysis.inFlightAtDeath?.op).toBe("getUniqueValues");
    expect(fs.readFileSync(recorder.file, "utf8")).not.toContain(secret);
  });

  test("a digest failure does not stop the join from being built", () => {
    const recorder = openRecorder({ dir });
    const modelDriver = wrapModelDriver(fakeModelDriver(), recorder, createHandleRegistry());
    // `src` is a getter that throws, standing in for any shape the digest
    // cannot walk. The handle must still come back.
    const hostile = {
      get src(): never {
        throw new Error("unwalkable def");
      },
      partitionFilters: [],
      filters: [],
      sorting: [],
    };
    expect(modelDriver.createPTable(hostile)).toBe("t1");
    const analysis = analyzeSession(recorder.file, dir);
    expect(analysis.recordCount).toBeGreaterThan(1);
  });
});

describe("review findings", () => {
  test("a death inside a synchronous creation call is attributed to that call", () => {
    const recorder = openRecorder({ dir });
    const modelDriver = wrapModelDriver(
      {
        createPFrame: () => "f1",
        // Stands in for the native engine dying mid-call: the process is gone
        // before the end record could be written.
        createPTable: (): string => {
          throw Object.assign(new Error("simulated hard death"), { hard: true });
        },
        createPTableV2: () => "t2",
      } as FakeModelDriver,
      recorder,
      createHandleRegistry(),
    );
    recorder.event("render-begin", { blockId: "block-7" });
    // Truncate the log right after the begin record, the way a kill would.
    const before = fs.statSync(recorder.file).size;
    try {
      modelDriver.createPTable(crossJoinDef());
    } catch {
      // expected
    }
    const content = fs.readFileSync(recorder.file, "utf8");
    const beginLine = content.split("\n").find((l) => l.includes('"createPTable-begin"'))!;
    fs.writeFileSync(recorder.file, `${content.slice(0, before)}${beginLine}\n`);

    const analysis = analyzeSession(recorder.file, dir);
    expect(analysis.inFlightAtDeath?.op).toBe("createPTable");
    expect(analysis.inFlightAtDeath?.block).toBe("block-7");
    // The definition it died on is still measurable from the truncated log.
    expect(analysis.requestedSize.requestedRows).toBeGreaterThan(0);
  });

  test("a rotated session keeps its header and pairs operations across segments", () => {
    const recorder = openRecorder({ dir, maxFileBytes: 2000, meta: { appVersion: "rot" } });
    recorder.event("getShape-begin", { handle: "t1", mem: recorder.memorySnapshot() });
    // Fill until exactly one rotation has happened, whatever the record sizes are
    // on this machine; a second rotation would discard the parked segment.
    while (!fs.existsSync(`${recorder.file}.1`)) {
      recorder.event("mem-self", { mem: recorder.memorySnapshot() });
    }
    recorder.event("getShape-end", {
      begin: 2,
      rows: 5,
      columns: 1,
      mem: recorder.memorySnapshot(),
    });
    recorder.event("getData-begin", { handle: "t1" });

    expect(fs.existsSync(`${recorder.file}.1`)).toBe(true);
    const active = fs.readFileSync(recorder.file, "utf8");
    expect(active).toContain('"continuation":true');

    const analysis = analyzeSession(recorder.file, dir);
    expect(analysis.env?.node).toBe(process.version);
    expect(analysis.meta).toEqual({ appVersion: "rot" });
    // The loss is reported rather than implied.
    expect(analysis.rotations).toBe(1);
    // getShape began before rotation and ended after it; only getData is open.
    expect(analysis.inFlight.map((op) => op.op)).toEqual(["getData"]);
    expect(analysis.attribution.some((op) => op.op === "getShape")).toBe(true);
  });

  test("an open begin survives repeated rotation, so the in-flight call is still named", () => {
    const recorder = openRecorder({ dir, maxFileBytes: 1800, meta: { appVersion: "carry" } });
    // These two never end. Their begin records are written before any rotation
    // and must still be there after the earliest segment has been overwritten.
    recorder.event("render-begin", { blockId: "block-7", mem: recorder.memorySnapshot() });
    recorder.event("createPTable-begin", {
      def: { kind: "PTableDef", def: { type: "inner" } },
      mem: recorder.memorySnapshot(),
    });

    rotateUntilEarliestSegmentLost(recorder);

    const analysis = analyzeSession(recorder.file, dir);
    expect(analysis.rotations).toBeGreaterThan(1);
    // Carried-forward begins repeat their sequence number and must not be
    // counted as separate operations.
    expect(analysis.inFlight.map((op) => `${op.op}#${op.seq}`)).toEqual([
      "render#2",
      "createPTable#3",
    ]);
    expect(analysis.inFlightAtDeath?.op).toBe("createPTable");
    expect(analysis.inFlightAtDeath?.block).toBe("block-7");
  });

  test("a render that spans rotation stops attributing calls once it has returned", () => {
    const recorder = openRecorder({ dir, maxFileBytes: 1800 });
    const render = recorder.event("render-begin", {
      blockId: "block-early",
      mem: recorder.memorySnapshot(),
    });
    // The begin is carried into the new segment, so the log holds two copies of
    // it under one sequence number.
    rotateUntilEarliestSegmentLost(recorder);
    recorder.event("render-end", { begin: render, mem: recorder.memorySnapshot() });

    // This call belongs to no render at all: the only one is over.
    recorder.event("createPTable-begin", {
      def: { kind: "PTableDef", def: crossJoinDef() },
      mem: recorder.memorySnapshot(),
    });

    const analysis = analyzeSession(recorder.file, dir);
    const [inFlight] = analysis.inFlight;
    expect(inFlight.op).toBe("createPTable");
    // The only render is over, so this call belongs to no block and none is named.
    expect(inFlight.block).toBeUndefined();
  });

  test("the earliest memory reading survives rotation, so growth is not understated", () => {
    const recorder = openRecorder({ dir, maxFileBytes: 1800 });
    recorder.event("getData-begin", { handle: "t1", mem: recorder.memorySnapshot() });
    rotateUntilEarliestSegmentLost(recorder);

    const analysis = analyzeSession(recorder.file, dir);
    // Without the carried baseline the heap series would start mid-session while
    // the sampler's resident series still starts at zero, which biases the
    // classifier toward blaming native memory.
    expect(fs.readFileSync(recorder.file, "utf8")).toContain('"mem-baseline"');
    expect(analysis.memory.heapGrowth).toBeDefined();
  });

  test("a completed operation is still paired when its begin was carried forward", () => {
    const recorder = openRecorder({ dir, maxFileBytes: 1800 });
    const begin = recorder.event("getShape-begin", {
      handle: "t1",
      mem: recorder.memorySnapshot(),
    });
    rotateUntilEarliestSegmentLost(recorder);
    recorder.event("getShape-end", { begin, rows: 5, mem: recorder.memorySnapshot() });

    const analysis = analyzeSession(recorder.file, dir);
    expect(analysis.inFlight).toEqual([]);
    expect(analysis.attribution.some((op) => op.op === "getShape")).toBe(true);
  });

  test("a render open across a rotation is listed once, and as finished", () => {
    const recorder = openRecorder({ dir, maxFileBytes: 2000 });
    const begin = recorder.event("render-begin", {
      blockId: "block-7",
      mem: recorder.memorySnapshot(),
    });
    while (!fs.existsSync(`${recorder.file}.1`)) {
      recorder.event("mem-self", { mem: recorder.memorySnapshot() });
    }
    recorder.event("render-end", { begin, ms: 5, mem: recorder.memorySnapshot() });

    const analysis = analyzeSession(recorder.file, dir);
    const renders = analysis.renders.filter((render) => render.blockId === "block-7");
    expect(renders).toHaveLength(1);
    expect(renders[0].end).toBe(true);
    expect(analysis.inFlight).toEqual([]);
  });

  test("a crash marker names its session and never attaches to a clean or unrelated one", () => {
    const clean = openRecorder({ dir });
    clean.event("getData-begin", { handle: "t1" });
    clean.close();

    const older = openRecorder({ dir });
    older.event("getData-begin", { handle: "t1" });
    // older never closes: it died, but nobody wrote a marker for it.

    const newer = openRecorder({ dir });
    newer.event("getData-begin", { handle: "t2" });
    writeCrashMarker(dir, {
      error: Object.assign(new Error("Worker terminated"), { code: "ERR_WORKER_OUT_OF_MEMORY" }),
    });

    // Two sessions look dead, so the marker names neither and says so.
    expect(analyzeSession(clean.file, dir).crashMarker).toBeUndefined();
    const olderAnalysis = analyzeSession(older.file, dir);
    expect(olderAnalysis.crashMarker).toBeUndefined();
    expect(olderAnalysis.crashMarkerAmbiguous).toBe(true);
  });

  test("an assigned session id binds the marker even while a newer session is live", () => {
    const dying = openRecorder({ dir });
    dying.event("getData-begin", { handle: "t1" });
    const live = openRecorder({ dir });
    live.event("getShape-begin", { handle: "t2" });
    // The live session keeps appending after the worker died — it is the newer file.
    writeCrashMarker(dir, {
      sessionId: dying.sessionId,
      error: Object.assign(new Error("Worker terminated"), { code: "ERR_WORKER_OUT_OF_MEMORY" }),
    });
    live.event("getShape-end", { begin: 2, mem: live.memorySnapshot() });

    expect(analyzeSession(dying.file, dir).crashMarker?.sessionId).toBe(dying.sessionId);
    expect(analyzeSession(dying.file, dir).crashMarker?.reason).toBe("js-heap-out-of-memory");
    expect(analyzeSession(live.file, dir).crashMarker).toBeUndefined();
  });

  test("a marker with no assigned id goes to the session that stopped writing", () => {
    const dying = openRecorder({ dir });
    dying.event("getData-begin", { handle: "t1" });
    const live = openRecorder({ dir });
    live.event("getShape-begin", { handle: "t2" });
    // No id handed over. The newest open log at this moment is the live
    // session's, so a guess would name the wrong one.
    writeCrashMarker(dir, {
      error: Object.assign(new Error("Worker terminated"), { code: "ERR_WORKER_OUT_OF_MEMORY" }),
    });
    const guess = readCrashMarkers(dir)[0];
    expect(guess.sessionId).toBeUndefined();
    expect(guess.guessedSessionId).toBe(live.sessionId);

    // The live session carries on well past the marker, which is what separates
    // it from the one that died.
    fs.appendFileSync(
      live.file,
      `${JSON.stringify({ seq: 99, t: 0, wall: Date.now() + 60_000, type: "mem-self" })}\n`,
    );

    expect(analyzeSession(live.file, dir).crashMarker).toBeUndefined();
    // The guess named the live session, yet the death is attributed to the one
    // that actually stopped writing.
    expect(analyzeSession(dying.file, dir).crashMarker?.reason).toBe("js-heap-out-of-memory");
  });

  test("two sessions that both look dead leave the marker unattributed", () => {
    const first = openRecorder({ dir });
    first.event("getData-begin", { handle: "t1" });
    const second = openRecorder({ dir });
    second.event("getData-begin", { handle: "t2" });
    // Neither closes and neither writes again, so timing cannot tell them apart.
    writeCrashMarker(dir, { reason: "killed-by-os" });

    for (const session of [first, second]) {
      const analysis = analyzeSession(session.file, dir);
      expect(analysis.crashMarker).toBeUndefined();
      expect(analysis.crashMarkerAmbiguous).toBe(true);
    }
  });

  test("a legacy marker without a session id is bounded by the next session's start", () => {
    const first = openRecorder({ dir });
    first.event("getData-begin", { handle: "t1" });
    const firstLast = Date.now();
    // Legacy marker: written for `first`, carries no session id.
    fs.writeFileSync(
      path.join(dir, `crash-${firstLast + 1}.ndjson`),
      `${JSON.stringify({ type: "external-crash", wall: firstLast + 1, reason: "killed-by-os" })}\n`,
    );
    // A second session starts strictly later.
    const secondStart = firstLast + 10;
    const secondFile = path.join(dir, `flight-${secondStart}-1-abcdef.ndjson`);
    fs.writeFileSync(
      secondFile,
      `${JSON.stringify({ seq: 1, t: 0, wall: secondStart, type: "session", env: {} })}\n` +
        `${JSON.stringify({ seq: 2, t: 1, wall: secondStart + 1, type: "getData-begin" })}\n`,
    );

    expect(analyzeSession(first.file, dir).crashMarker?.reason).toBe("killed-by-os");
    expect(analyzeSession(secondFile, dir).crashMarker).toBeUndefined();
  });
});

// Internals

/**
 * Fills the log until the earliest segment has been overwritten: the parked
 * segment is itself a rotated one, which is the case the carry-forward exists
 * for. Counting headers in the active file would not do — the preamble is
 * rewritten from scratch on every rotation, so it always holds exactly one.
 */
function rotateUntilEarliestSegmentLost(recorder: Recorder): void {
  const parked = `${recorder.file}.1`;
  for (let guard = 0; guard < 20_000; guard++) {
    recorder.event("mem-self", { mem: recorder.memorySnapshot() });
    if (fs.existsSync(parked) && fs.readFileSync(parked, "utf8").includes('"continuation":true')) {
      return;
    }
  }
  throw new Error("log did not rotate twice");
}

type FakeModelDriver = {
  createPFrame(def: unknown): string;
  createPTable(def: unknown): string;
  createPTableV2(def: unknown): string;
};

function fakeModelDriver(): FakeModelDriver {
  return {
    createPFrame: () => "f1",
    createPTable: () => "t1",
    createPTableV2: () => "t2",
  };
}

/**
 * The reproducer's shape with inline data: two sides keyed on a shared group
 * axis, each with a private item axis, `rows` records spread over `groups`.
 */
function inlineFanOutDef(rows: number, groups: number): unknown {
  const column = (name: string, own: string) => ({
    type: "column",
    column: {
      id: `id-${name}`,
      spec: {
        kind: "PColumn",
        name,
        valueType: "Int",
        axesSpec: [
          { type: "Int", name: "group" },
          { type: "Int", name: own },
        ],
      },
      data: Array.from({ length: rows }, (_, i) => ({ key: [i % groups, i], val: i })),
    },
  });
  return {
    src: { type: "inner", entries: [column("a", "left"), column("b", "right")] },
    partitionFilters: [],
    filters: [],
    sorting: [],
  };
}

/** An inner join keyed on a shared axis whose sides each add one of their own. */
function fanOutDef(rows: number): unknown {
  const column = (name: string, own: string) => ({
    type: "column",
    column: {
      id: `id-${name}`,
      spec: {
        kind: "PColumn",
        name,
        valueType: "Int",
        axesSpec: [
          { type: "String", name: "shared" },
          { type: "String", name: own },
        ],
      },
      data: {
        type: "ParquetPartitioned",
        partitionKeyLength: 1,
        parts: { "[0]": { data: "b", stats: { numberOfRows: rows } } },
      },
    },
  });
  return {
    src: { type: "inner", entries: [column("a", "left"), column("b", "right")] },
    partitionFilters: [],
    filters: [],
    sorting: [],
  };
}

function crossJoinDef(): unknown {
  const column = (name: string, axisName: string, rows: number) => ({
    type: "column",
    column: {
      id: `id-${name}`,
      spec: {
        kind: "PColumn",
        name,
        valueType: "Int",
        axesSpec: [{ type: "String", name: axisName }],
      },
      data: {
        type: "ParquetPartitioned",
        partitionKeyLength: 1,
        parts: { "[0]": { data: "b", stats: { numberOfRows: rows } } },
      },
    },
  });
  return {
    src: {
      type: "inner",
      entries: [
        column("perSample", "pl7.app/sampleId", 384),
        column("perClonotype", "pl7.app/vdj/clonotypeKey", 2_400_000),
      ],
    },
    partitionFilters: [],
    filters: [],
    sorting: [],
  };
}

/** Writes a sampler log beside an already-open session. */
function writeSampler(
  dir: string,
  sessionId: string,
  samples: { rss: number; freeMemory: number }[],
): void {
  let peakRss = 0;
  const lines = samples.map((sample, index) => {
    peakRss = Math.max(peakRss, sample.rss);
    return JSON.stringify({
      seq: index + 1,
      t: index + 1,
      wall: Date.now() + index,
      type: "mem-sampler",
      rss: sample.rss,
      peakRss,
      freeMemory: sample.freeMemory,
      totalMemory: 48 * 1024 ** 3,
    });
  });
  fs.writeFileSync(path.join(dir, `mem-${sessionId}.ndjson`), `${lines.join("\n")}\n`);
}

/** Writes a minimal crashed session plus a sampler series with chosen numbers. */
function seedSession(
  dir: string,
  samples: { rss: number; freeMemory: number } | { rss: number; freeMemory: number }[],
): string {
  const recorder = openRecorder({ dir });
  recorder.event("getData-begin", { handle: "t1" });
  const sessionId = recorder.sessionId;
  const series = Array.isArray(samples) ? samples : [samples];
  let peakRss = 0;
  const lines = series.map((sample, index) => {
    peakRss = Math.max(peakRss, sample.rss);
    return JSON.stringify({
      seq: index + 1,
      t: index + 1,
      wall: Date.now() + index,
      type: "mem-sampler",
      rss: sample.rss,
      peakRss,
      freeMemory: sample.freeMemory,
      totalMemory: 48 * 1024 ** 3,
    });
  });
  fs.writeFileSync(path.join(dir, `mem-${sessionId}.ndjson`), `${lines.join("\n")}\n`);
  return sessionId;
}
