import { describe, test, expect } from "vitest";
import { matchesGlob } from "../glob";

describe("matchesGlob", () => {
  test("`*` matches within a segment, not across `/`", () => {
    expect(matchesGlob("src/*.test.ts", "src/foo.test.ts")).toBe(true);
    expect(matchesGlob("src/*.test.ts", "src/foo.ts")).toBe(false);
    // `*` does not cross a slash
    expect(matchesGlob("src/*.test.ts", "src/sub/foo.test.ts")).toBe(false);
  });

  test("`**/` matches any depth, including zero segments", () => {
    expect(matchesGlob("src/**/*.test.ts", "src/foo.test.ts")).toBe(true);
    expect(matchesGlob("src/**/*.test.ts", "src/sub/foo.test.ts")).toBe(true);
    expect(matchesGlob("src/**/*.test.ts", "src/a/b/c/foo.test.ts")).toBe(true);
    expect(matchesGlob("src/**/*.test.ts", "src/foo.ts")).toBe(false);
    expect(matchesGlob("src/**/*.test.ts", "other/foo.test.ts")).toBe(false);
  });

  test("module-relative prefixes compose (as the runner resolves them)", () => {
    expect(matchesGlob("model/src/**/*.test.ts", "model/src/label.test.ts")).toBe(true);
    expect(matchesGlob("model/src/**/*.test.ts", "ui/src/label.test.ts")).toBe(false);
    expect(matchesGlob("workflow/src/**/*.test.ts", "workflow/src/test/columns.test.ts")).toBe(
      true,
    );
  });

  test("literal dots are not wildcards", () => {
    expect(matchesGlob("a.b", "axb")).toBe(false);
    expect(matchesGlob("a.b", "a.b")).toBe(true);
  });

  test("`?` matches exactly one non-slash char", () => {
    expect(matchesGlob("src/?.ts", "src/a.ts")).toBe(true);
    expect(matchesGlob("src/?.ts", "src/ab.ts")).toBe(false);
    expect(matchesGlob("src/?.ts", "src//.ts")).toBe(false);
  });

  test("whole-path anchored (no partial matches)", () => {
    expect(matchesGlob("src/*.ts", "x/src/foo.ts")).toBe(false);
    expect(matchesGlob("src/*.ts", "src/foo.ts.bak")).toBe(false);
  });
});
