// Line-list parser — round trip, comment + whitespace normalisation,
// `containsEntry` semantics for .gitignore-style files.

import { describe, test, expect } from "vitest";
import {
  parseLines,
  serializeLines,
  normaliseLine,
  lineEqualsEntry,
  containsEntry,
} from "../parsers/lines";

describe("line-list parser", () => {
  test("round trip is stable on a canonical file", () => {
    const raw = "a\nb\nc\n";
    expect(serializeLines(parseLines(raw))).toBe(raw);
  });

  test("normaliseLine strips comments and whitespace", () => {
    expect(normaliseLine("  node_modules/   # ignore deps")).toBe("node_modules/");
    expect(normaliseLine("# pure comment")).toBe("");
    expect(normaliseLine("dist/")).toBe("dist/");
    expect(normaliseLine("")).toBe("");
  });

  test("lineEqualsEntry compares post-normalisation", () => {
    expect(lineEqualsEntry("  dist/", "dist/")).toBe(true);
    expect(lineEqualsEntry("dist/ # trailing", "dist/")).toBe(true);
    expect(lineEqualsEntry("# dist/", "dist/")).toBe(false);
    expect(lineEqualsEntry("dist/", "dist")).toBe(false);
  });

  test("containsEntry scans across a line list", () => {
    const lines = parseLines("node_modules/\n# build artefacts\ndist/   # do not commit\n");
    expect(containsEntry(lines, "dist/")).toBe(true);
    expect(containsEntry(lines, "node_modules/")).toBe(true);
    expect(containsEntry(lines, "missing/")).toBe(false);
  });

  test("missing trailing newline parses identically", () => {
    expect(parseLines("a\nb")).toEqual(["a", "b"]);
    expect(parseLines("a\nb\n")).toEqual(["a", "b"]);
  });
});
