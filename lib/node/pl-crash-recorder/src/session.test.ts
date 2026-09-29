import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { endSession, listSessions, openRecorder } from "./recorder";
import { openRecordingSession } from "./session";

const stops = vi.hoisted((): Mock[] => []);

vi.mock("./sampler", () => ({
  startMemorySampler: () => {
    const stop = vi.fn();
    stops.push(stop);
    return { file: "memory.ndjson", stop };
  },
}));

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "crash-session-"));
  stops.length = 0;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("recording sessions that share an id", () => {
  test("a new session closes the old one and stops its sampler", () => {
    const first = openRecordingSession({ dir, sessionId: "1-1-shared" });
    const second = openRecordingSession({ dir, sessionId: "1-1-shared" });

    expect(stops[0]).toHaveBeenCalledOnce();
    expect(stops[1]).not.toHaveBeenCalled();
    expect(first?.recorder.event("mem-self", {})).toBe(-1);
    expect(second?.recorder.event("mem-self", {})).toBeGreaterThan(0);
    second?.close();
  });

  test("a recorder opened on the file of a session stops that session's sampler", () => {
    const session = openRecordingSession({ dir, sessionId: "1-1-owned" });
    const recorder = openRecorder({ dir, sessionId: "1-1-owned" });

    expect(stops[0]).toHaveBeenCalledOnce();
    expect(session?.recorder.event("mem-self", {})).toBe(-1);
    recorder.close();
  });

  test("ending a live session from the same thread stops its sampler", () => {
    const session = openRecordingSession({ dir, sessionId: "1-1-ended" });

    expect(endSession(dir, "1-1-ended", "app-quit")).toBe(true);
    expect(stops[0]).toHaveBeenCalledOnce();
    expect(session?.recorder.event("mem-self", {})).toBe(-1);
    expect(listSessions(dir)[0].crashed).toBe(false);
  });

  test("a late close of a replaced session leaves the new one open", () => {
    const first = openRecordingSession({ dir, sessionId: "1-1-late" });
    const second = openRecordingSession({ dir, sessionId: "1-1-late" });
    first?.close("late");

    expect(stops[1]).not.toHaveBeenCalled();
    expect(second?.recorder.event("mem-self", {})).toBeGreaterThan(0);
    second?.close();
  });

  test("a session with another id stays open", () => {
    const first = openRecordingSession({ dir, sessionId: "1-1-a" });
    const second = openRecordingSession({ dir, sessionId: "1-1-b" });

    expect(first?.recorder.event("mem-self", {})).toBeGreaterThan(0);
    first?.close();
    second?.close();
  });
});
