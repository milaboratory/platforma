import { describe, expect, test } from "vitest";
import { worseStatus } from "./types";

describe("worseStatus", () => {
  test.each([
    ["present", "resolving", "resolving"],
    ["resolving", "absent", "absent"],
    ["absent", "errored", "errored"],
    ["errored", "present", "errored"],
  ] as const)("%s and %s fold to %s", (a, b, worse) => {
    expect(worseStatus(a, b)).toBe(worse);
    expect(worseStatus(b, a)).toBe(worse);
  });
});
