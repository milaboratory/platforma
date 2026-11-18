import { expect, test } from "vitest";
import { TxCounter } from "./tx_counts";

test("attempts are counted per transaction name and outcome", () => {
  const counter = new TxCounter();
  counter.record("ProjectAction: mutate-block-storage", "conflict");
  counter.record("ProjectAction: mutate-block-storage", "committed");
  counter.record("ProjectAction: mutate-block-storage", "closed");
  counter.record("ReadingTree", "closed");
  counter.record("ReadingTree", "closed");
  counter.record("ReadingTree", "error");

  expect(counter.snapshot()).toEqual({
    "ProjectAction: mutate-block-storage": { committed: 1, closed: 1, conflict: 1, error: 0 },
    ReadingTree: { committed: 0, closed: 2, conflict: 0, error: 1 },
  });
});

test("a snapshot keeps the counts it was taken with", () => {
  const counter = new TxCounter();
  counter.record("ReadingTree", "closed");
  const before = counter.snapshot();

  counter.record("ReadingTree", "closed");
  counter.record("MLInitialization", "committed");

  expect(before).toEqual({ ReadingTree: { committed: 0, closed: 1, conflict: 0, error: 0 } });
  expect(counter.snapshot()["ReadingTree"]?.closed).toBe(2);
});

test("nothing recorded gives an empty snapshot", () => {
  expect(new TxCounter().snapshot()).toEqual({});
});
