import { test, expect } from "vitest";
import { derivePollingInterval } from "./synchronized_tree";

/** The project-list / sharing singleton trees run at 200ms; per-project trees at 1000ms. */
const FAST = 200;

test("no rtt sample yet leaves the configured interval alone", () => {
  expect(derivePollingInterval({ configuredMs: FAST, rttMs: undefined })).toEqual(FAST);
});

test("a fast link keeps the configured interval", () => {
  // 10ms RTT would imply a 20ms floor, well under the configured value.
  expect(derivePollingInterval({ configuredMs: FAST, rttMs: 10 })).toEqual(FAST);
});

test("a slow link spaces polls by rtt", () => {
  // The spec's target envelope: 1.4s RTT against a 200ms fixed interval, which is the
  // regime where unconditional polling outran what the link could deliver.
  expect(derivePollingInterval({ configuredMs: FAST, rttMs: 1400 })).toEqual(2800);
});
