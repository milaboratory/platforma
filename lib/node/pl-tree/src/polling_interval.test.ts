import { test, expect } from "vitest";
import { derivePollingInterval } from "./synchronized_tree";

/** The project-list / sharing singleton trees run at 200ms; per-project trees at 1000ms. */
const FAST = 200;

test("no rtt sample yet leaves the configured interval alone", () => {
  expect(
    derivePollingInterval({ configuredMs: FAST, currentMs: FAST, rttMs: undefined, changed: true }),
  ).toEqual(FAST);
});

test("a fast link keeps the configured interval", () => {
  // 10ms RTT would imply a 20ms floor, well under the configured value.
  expect(
    derivePollingInterval({ configuredMs: FAST, currentMs: FAST, rttMs: 10, changed: true }),
  ).toEqual(FAST);
});

test("a slow link spaces polls by rtt", () => {
  // The spec's target envelope: 1.4s RTT against a 200ms fixed interval, which is the
  // regime where unconditional polling outran what the link could deliver.
  expect(
    derivePollingInterval({ configuredMs: FAST, currentMs: FAST, rttMs: 1400, changed: true }),
  ).toEqual(2800);
});

test("idle cycles back off, and a change snaps straight back", () => {
  const step = (currentMs: number, changed: boolean) =>
    derivePollingInterval({ configuredMs: FAST, currentMs, rttMs: 10, changed });

  // Nothing changed: the interval walks out, strictly increasing each time.
  const first = step(FAST, false);
  const second = step(first, false);
  const third = step(second, false);
  expect(first).toBeGreaterThan(FAST);
  expect(second).toBeGreaterThan(first);
  expect(third).toBeGreaterThan(second);

  // One changed cycle returns to the floor immediately, no gradual recovery.
  expect(step(third, true)).toEqual(FAST);
});

test("idle backoff is bounded", () => {
  let interval = FAST;
  for (let i = 0; i < 100; i++) {
    interval = derivePollingInterval({
      configuredMs: FAST,
      currentMs: interval,
      rttMs: 10,
      changed: false,
    });
  }
  // Must converge on the ceiling rather than growing without limit.
  expect(interval).toEqual(5_000);
});

test("the rtt floor outranks the ceiling on a very slow link", () => {
  // 4s RTT implies an 8s floor, past the 5s ceiling. Clamping to 5s would poll faster than
  // the link can answer, so the floor has to win.
  const interval = derivePollingInterval({
    configuredMs: FAST,
    currentMs: FAST,
    rttMs: 4000,
    changed: false,
  });
  expect(interval).toEqual(8_000);
});
