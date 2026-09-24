import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { listSessions, openRecorder, type Recorder } from "./recorder";
import { DEATH_FILE_PREFIX } from "./events";
import { readCrashMarkers, writeCrashMarker } from "./supervisor";
import { createHandleRegistry, recordModelRenderSync, wrapModelDriver } from "./instrument";
import { startHostSampler } from "./host_sampler";

/**
 * What the recorder must guarantee about the log it leaves behind.
 *
 * Asserted against the raw lines rather than through any reader, because the
 * reader is not part of this package: a log is a file someone else will open,
 * and these are the properties that file has to have on its own.
 */

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "crash-recorder-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("what a crash leaves behind", () => {
  test("a session with no terminating record is reported as crashed", () => {
    const recorder = openRecorder({ dir });
    recorder.event("getShape-begin", { handle: "t1" });
    // Deliberately not closed: this is what a killed process leaves.

    const [session] = listSessions(dir);
    expect(session.crashed).toBe(true);
    expect(recordsOf(recorder).some((r) => r.type === "getShape-begin")).toBe(true);
  });

  test("a closed session is reported as clean", () => {
    const recorder = openRecorder({ dir });
    recorder.event("getShape-begin", { handle: "t1" });
    recorder.close();

    expect(listSessions(dir)[0].crashed).toBe(false);
  });

  test("records are readable even though the process never flushed", () => {
    // Written with writeSync on an append descriptor, so a kill -9 between two
    // records costs the records after it and nothing before.
    const recorder = openRecorder({ dir });
    for (let i = 0; i < 50; i++) recorder.event("mem-self", { mem: recorder.memorySnapshot() });
    expect(recordsOf(recorder)).toHaveLength(51);
  });
});

describe("rotation", () => {
  test("the session header, the earliest memory reading and open begins are carried", () => {
    const recorder = openRecorder({ dir, maxFileBytes: 1800, meta: { appVersion: "rot" } });
    const begin = recorder.event("createPTable-begin", {
      blockId: "block-7",
      mem: recorder.memorySnapshot(),
    });
    rotateUntilEarliestSegmentLost(recorder);

    const records = recordsOf(recorder);
    // The header, or nothing in the surviving segment says which session it is.
    expect(records.some((r) => r.type === "session" && r.continuation === true)).toBe(true);
    // The baseline, or growth would be measured from mid-session.
    expect(records.some((r) => r.type === "mem-baseline")).toBe(true);
    // The open begin, under its original sequence number, or the operation that
    // was running at the moment of death disappears from the log entirely.
    const carried = records.find((r) => r.type === "createPTable-begin" && r.carriedForward);
    expect(carried?.seq).toBe(begin);
    expect(carried?.blockId).toBe("block-7");
  });

  test("a begin that has ended is not carried", () => {
    const recorder = openRecorder({ dir, maxFileBytes: 1800 });
    const begin = recorder.event("getShape-begin", { handle: "t1" });
    recorder.event("getShape-end", { begin });
    rotateUntilEarliestSegmentLost(recorder);

    expect(recordsOf(recorder).some((r) => r.type === "getShape-begin")).toBe(false);
  });

  test("a sticky record outlives the segment it was written in", () => {
    const recorder = openRecorder({ dir, maxFileBytes: 1800 });
    recorder.sticky("b1", "block", { blockId: "b1", block: "org:name", blockVersion: "2.4.1" });
    rotateUntilEarliestSegmentLost(recorder);

    // Without this a long session loses the legend for every block id in what
    // survives, and the surviving records name code nobody can find.
    const block = recordsOf(recorder).find((r) => r.type === "block");
    expect(block?.block).toBe("org:name");
    expect(block?.blockVersion).toBe("2.4.1");
  });

  test("a sticky record is written once however often it is offered", () => {
    const recorder = openRecorder({ dir });
    for (let i = 0; i < 5; i++) recorder.sticky("b1", "block", { blockId: "b1" });

    expect(recordsOf(recorder).filter((r) => r.type === "block")).toHaveLength(1);
  });
});

describe("what a record says about the code that made it", () => {
  test("a driver call made inside a render carries that render's block", () => {
    const recorder = openRecorder({ dir });
    const driver = wrapModelDriver(fakeModelDriver(), recorder, createHandleRegistry());
    recordModelRenderSync(recorder, { blockId: "b1", block: "org:name" }, () => {
      driver.createPTable({ src: { type: "inner", entries: [] } });
    });

    const created = recordsOf(recorder).find((r) => r.type === "createPTable-begin");
    expect(created?.blockId).toBe("b1");
  });

  test("a driver call made outside every render claims no block", () => {
    const recorder = openRecorder({ dir });
    const driver = wrapModelDriver(fakeModelDriver(), recorder, createHandleRegistry());
    driver.createPTable({ src: { type: "inner", entries: [] } });

    const created = recordsOf(recorder).find((r) => r.type === "createPTable-begin");
    expect(created?.blockId).toBeUndefined();
  });

  test("a definition is recorded without the values it was built from", () => {
    const recorder = openRecorder({ dir });
    const driver = wrapModelDriver(fakeModelDriver(), recorder, createHandleRegistry());
    const secret = "PATIENT-0007-CDR3";
    driver.createPTable({
      src: {
        type: "inner",
        entries: [
          {
            type: "column",
            column: {
              id: "c",
              spec: { kind: "PColumn", name: "x", valueType: "String", axesSpec: [] },
              data: [{ key: [secret], val: secret }],
            },
          },
        ],
      },
    });

    expect(fs.readFileSync(recorder.file, "utf8")).not.toContain(secret);
  });
});

describe("what a definition records about its keys", () => {
  test("distinct tuples are counted, not inferred from the axes", () => {
    const recorder = openRecorder({ dir });
    const driver = wrapModelDriver(fakeModelDriver(), recorder, createHandleRegistry());
    // Two axes that vary together: four records, two values on each axis, but
    // only two key tuples. Multiplying the per-axis counts would say four.
    driver.createPTable(
      columnDef([
        [1, "a"],
        [1, "a"],
        [2, "b"],
        [2, "b"],
      ]),
    );

    const def = recordsOf(recorder).find((r) => r.type === "createPTable-begin")?.def;
    const data = def?.def?.src?.entries?.[0]?.column?.data;
    expect(data.axisCardinality).toEqual([2, 2]);
    expect(data.distinctKeys).toBe(2);
  });

  test("counting is declined rather than approximated past the cap", () => {
    const recorder = openRecorder({ dir });
    const driver = wrapModelDriver(fakeModelDriver(), recorder, createHandleRegistry());
    driver.createPTable(
      columnDef(Array.from({ length: 100_001 }, (_, i) => [i, String(i)] as [number, string])),
    );

    const def = recordsOf(recorder).find((r) => r.type === "createPTable-begin")?.def;
    const data = def?.def?.src?.entries?.[0]?.column?.data;
    // A number that is present is always true; here none is, and the log says so.
    expect(data.axisCardinality).toBeUndefined();
    expect(data.distinctKeys).toBeUndefined();
    expect(data.axisCardinalityUncounted).toBe(true);
  });
});

describe("host readings", () => {
  test("attribution is written beside the session, not into it", async () => {
    const recorder = openRecorder({ dir });
    const sampler = startHostSampler({
      dir,
      sessionId: recorder.sessionId,
      intervalMs: 5,
      read: () => ({ private: 42 * 1024 ** 3, swapUsed: 1024 ** 3 }),
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    sampler.stop();

    // A separate file: the session log belongs to another thread, with its own
    // descriptor and sequence, and a second writer would corrupt both.
    expect(sampler.file).not.toBe(recorder.file);
    expect(path.basename(sampler.file)).toBe(`host-${recorder.sessionId}.ndjson`);
    const records = fs
      .readFileSync(sampler.file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, any>);
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].type).toBe("mem-host");
    expect(records[0].private).toBe(42 * 1024 ** 3);
  });

  test("a reading that throws costs the reading, not the application", async () => {
    const recorder = openRecorder({ dir });
    const sampler = startHostSampler({
      dir,
      sessionId: recorder.sessionId,
      intervalMs: 5,
      read: () => {
        throw new Error("no such counter on this platform");
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    sampler.stop();

    expect(fs.readFileSync(sampler.file, "utf8")).toBe("");
  });
});

describe("crash markers", () => {
  test("a marker names the session the parent assigned, and carries memory", () => {
    const recorder = openRecorder({ dir });
    writeCrashMarker(dir, { reason: "worker-exit", code: 1, sessionId: recorder.sessionId });

    const [marker] = readCrashMarkers(dir);
    expect(marker.sessionId).toBe(recorder.sessionId);
    // On its own an exit code reads like an ordinary failure; the reading taken
    // beside it is what says whether memory was the reason.
    expect(marker.memoryAtDeath?.rss).toBeGreaterThan(0);
    expect(marker.memoryAtDeath?.totalMemory).toBeGreaterThan(0);
  });

  test("a marker with no assigned session claims none as its own", () => {
    openRecorder({ dir });
    writeCrashMarker(dir, { reason: "killed-by-os" });

    const [marker] = readCrashMarkers(dir);
    // Guessing is offered as advisory only: naming the wrong session would both
    // misattribute the death and stop the right one from claiming it.
    expect(marker.sessionId).toBeUndefined();
    expect(marker.guessedSessionId).toBeDefined();
  });

  test("a marker carries the file it was read from", () => {
    const written = writeCrashMarker(dir, { reason: "worker-exit", code: 1 });

    // A consumer collecting evidence attaches this path. Spelling the name a
    // second time on its own is how a rename silently drops the one record the
    // parent contributes.
    const [marker] = readCrashMarkers(dir);
    expect(marker.file).toBe(written);
    expect(fs.existsSync(marker.file)).toBe(true);
  });

  test("an unparseable marker is skipped rather than failing the rest", () => {
    writeCrashMarker(dir, { reason: "worker-exit" });
    // Named like a marker, so it reaches the parse rather than being filtered
    // out by name — which is the path this test exists to cover.
    fs.writeFileSync(path.join(dir, `${DEATH_FILE_PREFIX}-999.ndjson`), "{ not json\n");

    expect(readCrashMarkers(dir)).toHaveLength(1);
  });

  test("a file that is not a marker is passed over without being read", () => {
    writeCrashMarker(dir, { reason: "worker-exit" });
    fs.writeFileSync(path.join(dir, "crash-999.ndjson"), "{ not json\n");

    // Logs written under an earlier name share the directory; they are not
    // markers now, and failing to parse one would be reading the wrong file.
    expect(readCrashMarkers(dir)).toHaveLength(1);
  });
});

// Internals

/** One column whose records carry the given two-part keys. */
function columnDef(keys: [number, string][]): unknown {
  return {
    src: {
      type: "inner",
      entries: [
        {
          type: "column",
          column: {
            id: "c",
            spec: {
              kind: "PColumn",
              name: "x",
              valueType: "Int",
              axesSpec: [
                { type: "Int", name: "a" },
                { type: "String", name: "b" },
              ],
            },
            data: keys.map((key, i) => ({ key, val: i })),
          },
        },
      ],
    },
    partitionFilters: [],
    filters: [],
    sorting: [],
  };
}

/** A driver that returns handles and does nothing, so only the recording shows. */
function fakeModelDriver() {
  return {
    createPFrame: (_def: unknown) => "f",
    createPTable: (_def: unknown) => "t",
    createPTableV2: (_def: unknown) => "t2",
  };
}

function recordsOf(recorder: Recorder): Record<string, any>[] {
  return fs
    .readFileSync(recorder.file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, any>);
}

/** Writes until the segment holding the original records has been discarded. */
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
