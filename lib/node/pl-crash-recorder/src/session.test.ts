import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

  test("a session with another id stays open", () => {
    const first = openRecordingSession({ dir, sessionId: "1-1-a" });
    const second = openRecordingSession({ dir, sessionId: "1-1-b" });

    expect(first?.recorder.event("mem-self", {})).toBeGreaterThan(0);
    first?.close();
    second?.close();
  });
});
