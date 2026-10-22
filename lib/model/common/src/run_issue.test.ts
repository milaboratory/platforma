import { describe, expect, test } from "vitest";
import { parseRunIssue, parseRunIssues } from "./run_issue";

describe("parseRunIssue", () => {
  test("reads an error and a warning as they are", () => {
    expect(parseRunIssue({ severity: "error", message: "Select a dataset" })).toEqual({
      severity: "error",
      message: "Select a dataset",
    });
    expect(parseRunIssue({ severity: "warning", message: "Few samples" })).toEqual({
      severity: "warning",
      message: "Few samples",
    });
  });

  test("reads any severity other than warning as an error", () => {
    expect(parseRunIssue({ severity: "fatal", message: "m" }).severity).toBe("error");
    expect(parseRunIssue({ severity: "Warning", message: "m" }).severity).toBe("error");
    expect(parseRunIssue({ message: "m" }).severity).toBe("error");
  });

  test("keeps only severity and message", () => {
    expect(parseRunIssue({ severity: "warning", message: "m", extra: 1 })).toEqual({
      severity: "warning",
      message: "m",
    });
  });

  test("rejects a value that is not an object with a string message", () => {
    expect(() => parseRunIssue("oops")).toThrow(/must be an object, got string/);
    expect(() => parseRunIssue(null)).toThrow(/must be an object, got null/);
    expect(() => parseRunIssue({ severity: "error" })).toThrow(/string message, got undefined/);
    expect(() => parseRunIssue({ severity: "error", message: 42 })).toThrow(
      /string message, got number/,
    );
  });
});

describe("parseRunIssues", () => {
  test("reads every entry", () => {
    expect(
      parseRunIssues([
        { severity: "error", message: "a" },
        { severity: "other", message: "b" },
        { severity: "warning", message: "c" },
      ]),
    ).toEqual([
      { severity: "error", message: "a" },
      { severity: "error", message: "b" },
      { severity: "warning", message: "c" },
    ]);
    expect(parseRunIssues([])).toEqual([]);
  });

  test("rejects a value that is not an array, or a bad entry", () => {
    expect(() => parseRunIssues(undefined)).toThrow(/must be an array, got undefined/);
    expect(() => parseRunIssues({ severity: "error", message: "a" })).toThrow(
      /must be an array, got object/,
    );
    expect(() => parseRunIssues([{ severity: "error", message: "a" }, 7])).toThrow(
      /must be an object, got number/,
    );
  });
});
