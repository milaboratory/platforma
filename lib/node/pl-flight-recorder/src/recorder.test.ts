import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { listSessions, openRecorder, type Recorder } from "./recorder";
import { readCrashMarkers, writeCrashMarker } from "./supervisor";
import { createHandleRegistry, recordModelRenderSync, wrapModelDriver } from "./instrument";

/**
 * What the recorder must guarantee about the log it leaves behind.
 *
 * Asserted against the raw lines rather than through any reader, because the
 * reader is not part of this package: a log is a file someone else will open,
 * and these are the properties that file has to have on its own.
 */

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "flight-recorder-"));
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
    const driver = wrapModelDriver(
      { createPFrame: () => "f", createPTable: () => "t", createPTableV2: () => "t2" },
      recorder,
      createHandleRegistry(),
    );
    recordModelRenderSync(recorder, { blockId: "b1", block: "org:name" }, () => {
      driver.createPTable({ src: { type: "inner", entries: [] } });
    });

    const created = recordsOf(recorder).find((r) => r.type === "createPTable-begin");
    expect(created?.blockId).toBe("b1");
  });

  test("a driver call made outside every render claims no block", () => {
    const recorder = openRecorder({ dir });
    const driver = wrapModelDriver(
      { createPFrame: () => "f", createPTable: () => "t", createPTableV2: () => "t2" },
      recorder,
      createHandleRegistry(),
    );
    driver.createPTable({ src: { type: "inner", entries: [] } });

    const created = recordsOf(recorder).find((r) => r.type === "createPTable-begin");
    expect(created?.blockId).toBeUndefined();
  });

  test("a definition is recorded without the values it was built from", () => {
    const recorder = openRecorder({ dir });
    const driver = wrapModelDriver(
      { createPFrame: () => "f", createPTable: () => "t", createPTableV2: () => "t2" },
      recorder,
      createHandleRegistry(),
    );
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

  test("an unparseable marker is skipped rather than failing the rest", () => {
    writeCrashMarker(dir, { reason: "worker-exit" });
    fs.writeFileSync(path.join(dir, "crash-999.ndjson"), "{ not json\n");

    expect(readCrashMarkers(dir)).toHaveLength(1);
  });
});

// Internals

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
