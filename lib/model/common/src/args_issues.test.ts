import { describe, expect, test } from "vitest";
import { hasArgsErrors, parseArgsIssues } from "./args_issues";

describe("parseArgsIssues", () => {
  test("well-formed issues pass unchanged", () => {
    const issues = [
      { severity: "error", message: "Abundance is required" },
      { severity: "warning", message: "Few conditions" },
    ];

    expect(parseArgsIssues(issues)).toEqual(issues);
  });

  test("a value that is not a list is not issues", () => {
    expect(parseArgsIssues(undefined)).toBeUndefined();
    expect(parseArgsIssues({ severity: "error", message: "x" })).toBeUndefined();
  });

  test("a missing or unknown severity is an error", () => {
    expect(parseArgsIssues([{ message: "a" }, { severity: "info", message: "b" }])).toEqual([
      { severity: "error", message: "a" },
      { severity: "error", message: "b" },
    ]);
  });

  test("an item without a text message is still an issue", () => {
    expect(parseArgsIssues(["plain text", { severity: "warning" }, 42, null])).toEqual([
      { severity: "error", message: "plain text" },
      { severity: "warning", message: 'Malformed issue: {"severity":"warning"}' },
      { severity: "error", message: "Malformed issue: 42" },
      { severity: "error", message: "Malformed issue: null" },
    ]);
  });

  test("extra fields of an item are dropped", () => {
    expect(parseArgsIssues([{ severity: "warning", message: "m", path: ["a"] }])).toEqual([
      { severity: "warning", message: "m" },
    ]);
  });
});

describe("hasArgsErrors", () => {
  test("only an error holds the args back", () => {
    expect(hasArgsErrors([])).toBe(false);
    expect(hasArgsErrors([{ severity: "warning", message: "w" }])).toBe(false);
    expect(
      hasArgsErrors([
        { severity: "warning", message: "w" },
        { severity: "error", message: "e" },
      ]),
    ).toBe(true);
  });
});
