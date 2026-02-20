import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { PerfTimer } from "./perfTimer";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["performance"] });
});

afterEach(() => {
  vi.useRealTimers();
});

test("PerfTimer", () => {
  const timer = PerfTimer.start();
  expect(timer.elapsed()).toBe("0ms");

  // 999ms -> 999ms
  vi.advanceTimersByTime(999);
  expect(timer.elapsed()).toBe("999ms");

  // 1s -> 1s
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("1s");

  // 1s 1ms -> 1s 1ms
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("1s 1ms");

  // 2s 999ms -> 2s 999ms
  vi.advanceTimersByTime(1998);
  expect(timer.elapsed()).toBe("2s 999ms");

  // 3s -> 3s
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("3s");

  // 59s 999ms -> 59s 999ms
  vi.advanceTimersByTime(56_999);
  expect(timer.elapsed()).toBe("59s 999ms");

  // 1m -> 1m
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("1m");

  // 1m 1ms -> 1m
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("1m");

  // 1m 1s -> 1m 1s
  vi.advanceTimersByTime(999);
  expect(timer.elapsed()).toBe("1m 1s");

  // 1m 1s 600ms -> 1m 1s
  vi.advanceTimersByTime(600);
  expect(timer.elapsed()).toBe("1m 1s");

  // 1m 59s 999ms -> 1m 59s
  vi.advanceTimersByTime(58_399);
  expect(timer.elapsed()).toBe("1m 59s");

  // 2m -> 2m
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("2m");

  // 59m 59s 999ms -> 59m 59s
  vi.advanceTimersByTime(3_479_999);
  expect(timer.elapsed()).toBe("59m 59s");

  // 1h -> 1h
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("1h");

  // 1h 1ms -> 1h
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("1h");

  // 1h 1s 1ms -> 1h
  vi.advanceTimersByTime(1000);
  expect(timer.elapsed()).toBe("1h");

  // 1h 1m -> 1h 1m
  vi.advanceTimersByTime(58_999);
  expect(timer.elapsed()).toBe("1h 1m");

  // 1h 1m 1s -> 1h 1m
  vi.advanceTimersByTime(1000);
  expect(timer.elapsed()).toBe("1h 1m");

  // 1h 1m 1s 1ms -> 1h 1m
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("1h 1m");

  // 1h 59m 59s 999ms -> 1h 59m
  vi.advanceTimersByTime(3_538_998);
  expect(timer.elapsed()).toBe("1h 59m");

  // 2h -> 2h
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("2h");

  // 23h 59m 59s 999ms -> 23h 59m
  vi.advanceTimersByTime(79_199_999);
  expect(timer.elapsed()).toBe("23h 59m");

  // 1d -> 1d
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("1d");

  // 1d 1ms -> 1d
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("1d");

  // 1d 1s 1ms -> 1d
  vi.advanceTimersByTime(1000);
  expect(timer.elapsed()).toBe("1d");

  // 1d 1m -> 1d (no hours, so no minutes shown)
  vi.advanceTimersByTime(58_999);
  expect(timer.elapsed()).toBe("1d");

  // 1d 1m 1s -> 1d (no hours, so no minutes shown)
  vi.advanceTimersByTime(1000);
  expect(timer.elapsed()).toBe("1d");

  // 1d 1m 1s 1ms -> 1d (no hours, so no minutes shown)
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("1d");

  // 1d 1h -> 1d 1h
  vi.advanceTimersByTime(3_538_999);
  expect(timer.elapsed()).toBe("1d 1h");

  // 1d 23h 59m 59s 999ms -> 1d 23h
  vi.advanceTimersByTime(82_799_999);
  expect(timer.elapsed()).toBe("1d 23h");

  // 2d -> 2d
  vi.advanceTimersByTime(1);
  expect(timer.elapsed()).toBe("2d");
});
