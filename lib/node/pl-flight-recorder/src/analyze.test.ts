import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openRecorder, listSessions } from "./recorder";
import { writeCrashMarker } from "./supervisor";
import { analyzeLatest, analyzeSession } from "./analyze";
import { renderReport } from "./report";
import {
  createHandleRegistry,
  recordModelRender,
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
    expect(analysis.smokingGun?.op).toBe("getShape");
  });

  test("a closed session is reported as clean and has nothing in flight", () => {
    const recorder = openRecorder({ dir });
    recorder.event("getShape-begin", { handle: "t1" });
    recorder.event("getShape-end", { begin: 2, rows: 10, columns: 2 });
    recorder.close();

    const analysis = analyzeLatest(dir, { preferCrashed: false })!;
    expect(analysis.crashed).toBe(false);
    expect(analysis.inFlight).toEqual([]);
    expect(analysis.verdict.where).toBe("no operation was in flight");
  });

  test("the innermost unfinished operation is the smoking gun", () => {
    const recorder = openRecorder({ dir });
    recorder.event("render-begin", { blockId: "block-7" });
    recorder.event("getShape-begin", { handle: "t1" });
    recorder.event("getShape-end", { begin: 3 });
    recorder.event("getData-begin", { handle: "t1", unbounded: true, tableRows: 5_000_000 });

    const analysis = analyzeLatest(dir)!;
    expect(analysis.inFlight.map((op) => op.op)).toEqual(["render", "getData"]);
    expect(analysis.smokingGun?.op).toBe("getData");
    expect(analysis.findings.map((f) => f.rule)).toContain("unbounded-getData");
  });
});

describe("cause classification", () => {
  test("a supervisor marker turns an inferred heap death into a confirmed one", () => {
    const recorder = openRecorder({ dir });
    recorder.event("getData-begin", { handle: "t1" });
    writeCrashMarker(dir, {
      error: Object.assign(new Error("Worker terminated due to reaching memory limit"), {
        code: "ERR_WORKER_OUT_OF_MEMORY",
      }),
    });

    const analysis = analyzeSession(recorder.file, dir);
    expect(analysis.crashMarker?.reason).toBe("js-heap-out-of-memory");
    expect(analysis.verdict.memoryRegion).toBe("js-heap-exhaustion-confirmed");
  });

  test("a low free-memory reading alone does not accuse the OS", () => {
    // A small process on a machine whose free pages sit in the file cache, which
    // is the permanent state of affairs on macOS.
    const sessionId = seedSession(dir, { rss: 200 * 1024 * 1024, freeMemory: 1024 * 1024 });
    const analysis = analyzeSession(path.join(dir, `flight-${sessionId}.ndjson`), dir);
    expect(analysis.findings.map((f) => f.rule)).not.toContain("machine-memory-exhausted");
  });

  test("a process holding most of the machine's memory does accuse the OS", () => {
    const sessionId = seedSession(dir, { rss: 40 * 1024 ** 3, freeMemory: 1024 * 1024 });
    const analysis = analyzeSession(path.join(dir, `flight-${sessionId}.ndjson`), dir);
    expect(analysis.findings.map((f) => f.rule)).toContain("machine-memory-exhausted");
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
    const rules = analysis.findings.map((finding) => finding.rule);
    expect(rules).toContain("cross-join");
    expect(rules).toContain("join-amplification");
    expect(rules).toContain("unbounded-getData");
    expect(analysis.renders[0].blockId).toBe("block-clonotype-table-7");
    expect(analysis.renders[0].stats?.serOutBytes).toBe(1_204_880);

    const report = renderReport(analysis);
    expect(report).toContain("Verdict — cross-join");
    expect(report).toContain("block-clonotype-table-7");
    expect(report).toContain("DISJOINT");
    // The join that produced the failing handle is the one rendered.
    expect(report).toContain("rowsUpperBound=921,600,000");
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
    expect(analysis.smokingGun?.op).toBe("createPTable");
    expect(analysis.verdict.where).toContain("createPTable");
    expect(analysis.verdict.where).toContain("block-7");
    expect(renderReport(analysis)).toContain("Join in flight");
    expect(renderReport(analysis)).toContain("DISJOINT");
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
    // getShape began before rotation and ended after it; only getData is open.
    expect(analysis.inFlight.map((op) => op.op)).toEqual(["getData"]);
    expect(analysis.attribution.some((op) => op.op === "getShape")).toBe(true);
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

    expect(analyzeSession(clean.file, dir).crashMarker).toBeUndefined();
    expect(analyzeSession(older.file, dir).crashMarker).toBeUndefined();
    expect(analyzeSession(newer.file, dir).crashMarker?.sessionId).toBe(newer.sessionId);
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

/** Writes a minimal crashed session plus a sampler series with chosen numbers. */
function seedSession(dir: string, sample: { rss: number; freeMemory: number }): string {
  const recorder = openRecorder({ dir });
  recorder.event("getData-begin", { handle: "t1" });
  const sessionId = recorder.sessionId;
  const line = JSON.stringify({
    seq: 1,
    t: 1,
    wall: Date.now(),
    type: "mem-sampler",
    rss: sample.rss,
    peakRss: sample.rss,
    freeMemory: sample.freeMemory,
    totalMemory: 48 * 1024 ** 3,
  });
  fs.writeFileSync(path.join(dir, `mem-${sessionId}.ndjson`), `${line}\n`);
  return sessionId;
}
