import { describe, expect, test } from "vitest";
import { parseArgsIssue, parseArgsIssues } from "./args_issue";

describe("parseArgsIssue", () => {
  test("reads an error and a warning as they are", () => {
    expect(parseArgsIssue({ severity: "error", message: "Select a dataset" })).toEqual({
      severity: "error",
      message: "Select a dataset",
    });
    expect(parseArgsIssue({ severity: "warning", message: "Few samples" })).toEqual({
      severity: "warning",
      message: "Few samples",
    });
  });

  test("reads any severity other than warning as an error", () => {
    expect(parseArgsIssue({ severity: "fatal", message: "m" }).severity).toBe("error");
    expect(parseArgsIssue({ severity: "Warning", message: "m" }).severity).toBe("error");
    expect(parseArgsIssue({ message: "m" }).severity).toBe("error");
  });

  test("keeps only severity and message", () => {
    expect(parseArgsIssue({ severity: "warning", message: "m", extra: 1 })).toEqual({
      severity: "warning",
      message: "m",
    });
  });

  test("rejects a value that is not an object with a string message", () => {
    expect(() => parseArgsIssue("oops")).toThrow(/must be an object, got string/);
    expect(() => parseArgsIssue(null)).toThrow(/must be an object, got null/);
    expect(() => parseArgsIssue({ severity: "error" })).toThrow(/string message, got undefined/);
    expect(() => parseArgsIssue({ severity: "error", message: 42 })).toThrow(
      /string message, got number/,
    );
  });
});

describe("parseArgsIssues", () => {
  test("reads every entry", () => {
    expect(
      parseArgsIssues([
        { severity: "error", message: "a" },
        { severity: "other", message: "b" },
        { severity: "warning", message: "c" },
      ]),
    ).toEqual([
      { severity: "error", message: "a" },
      { severity: "error", message: "b" },
      { severity: "warning", message: "c" },
    ]);
    expect(parseArgsIssues([])).toEqual([]);
  });

  test("rejects a value that is not an array, or a bad entry", () => {
    expect(() => parseArgsIssues(undefined)).toThrow(/must be an array, got undefined/);
    expect(() => parseArgsIssues({ severity: "error", message: "a" })).toThrow(
      /must be an array, got object/,
    );
    expect(() => parseArgsIssues([{ severity: "error", message: "a" }, 7])).toThrow(
      /must be an object, got number/,
    );
  });
});
