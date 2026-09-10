import { describe, test, expect } from "vitest";
import {
  matchingModeToConstraints,
  resolveAnchorSide,
  type AnchorEntry,
  type MatchingMode,
} from "./discover_columns_options";

const MODES: MatchingMode[] = ["enrichment", "related", "exact"];

describe("matchingModeToConstraints", () => {
  test.each(MODES)("omits anchorsAre entirely for mode %s at the default", (mode) => {
    for (const constraints of [
      matchingModeToConstraints(mode),
      matchingModeToConstraints(mode, undefined),
      matchingModeToConstraints(mode, "roots"),
    ]) {
      // Absent, not `"roots"` — the engine defaults to root anchors, and omitting
      // the key keeps the request wire-identical to what existing callers produce.
      expect("anchorsAre" in constraints).toBe(false);
    }
  });

  test.each(MODES)("sets anchorsAre for mode %s when the anchors are leaves", (mode) => {
    expect(matchingModeToConstraints(mode, "leaves").anchorsAre).toBe("leaves");
  });

  test.each(MODES)("anchor position is orthogonal to the axes flags of mode %s", (mode) => {
    const { anchorsAre: _omitted, ...axesFlags } = matchingModeToConstraints(mode, "leaves");
    // Moving the anchors must not disturb any axes-matching flag.
    expect(axesFlags).toStrictEqual(matchingModeToConstraints(mode));
  });

  test("mode still drives the axes flags independently of anchor position", () => {
    expect(matchingModeToConstraints("exact", "leaves")).toStrictEqual({
      allowFloatingSourceAxes: false,
      allowFloatingHitAxes: false,
      allowSourceQualifications: false,
      allowHitQualifications: false,
      anchorsAre: "leaves",
    });
    expect(matchingModeToConstraints("enrichment")).toStrictEqual({
      allowFloatingSourceAxes: true,
      allowFloatingHitAxes: false,
      allowSourceQualifications: true,
      allowHitQualifications: true,
    });
  });
});

describe("resolveAnchorSide", () => {
  const given: Record<string, AnchorEntry> = { a: "anchor-id" as AnchorEntry };

  test("anchors are roots — discovery walks down to what they contain", () => {
    expect(resolveAnchorSide({ anchors: given })).toStrictEqual({
      anchors: given,
      anchorsAre: "roots",
    });
  });

  test("leaves are the fine end — discovery walks up to what contains them", () => {
    expect(resolveAnchorSide({ leaves: given })).toStrictEqual({
      anchors: given,
      anchorsAre: "leaves",
    });
  });

  test("neither key given still reports the default side", () => {
    expect(resolveAnchorSide({})).toStrictEqual({ anchors: undefined, anchorsAre: "roots" });
  });

  test("the two keys are mutually exclusive", () => {
    expect(() => resolveAnchorSide({ anchors: given, leaves: given })).toThrow(
      /mutually exclusive/,
    );
  });
});
