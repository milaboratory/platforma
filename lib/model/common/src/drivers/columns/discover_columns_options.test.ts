import { describe, test, expect } from "vitest";
import {
  matchingModeToConstraints,
  resolveAnchorSide,
  type AnchorEntry,
  type MatchingMode,
} from "./discover_columns_options";

const MODES: MatchingMode[] = ["enrichment", "related", "exact"];

describe("matchingModeToConstraints", () => {
  test.each(MODES)("mode %s yields only axes-matching flags", (mode) => {
    // Where the anchors sit is carried by the request shape, so nothing about
    // it may leak back into the constraints object.
    expect(Object.keys(matchingModeToConstraints(mode)).sort()).toStrictEqual([
      "allowFloatingHitAxes",
      "allowFloatingSourceAxes",
      "allowHitQualifications",
      "allowSourceQualifications",
    ]);
  });

  test("mode drives the flags", () => {
    expect(matchingModeToConstraints("exact")).toStrictEqual({
      allowFloatingSourceAxes: false,
      allowFloatingHitAxes: false,
      allowSourceQualifications: false,
      allowHitQualifications: false,
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

  test("anchors go into the request's `axes` arm — walk down to what they contain", () => {
    expect(resolveAnchorSide({ anchors: given })).toStrictEqual({
      anchors: given,
      axesKey: "axes",
    });
  });

  test("leaves go into the `leafAxes` arm — walk up to what contains them", () => {
    expect(resolveAnchorSide({ leaves: given })).toStrictEqual({
      anchors: given,
      axesKey: "leafAxes",
    });
  });

  test("neither key given still names the default arm", () => {
    expect(resolveAnchorSide({})).toStrictEqual({ anchors: undefined, axesKey: "axes" });
  });

  test("the two keys are mutually exclusive", () => {
    expect(() => resolveAnchorSide({ anchors: given, leaves: given })).toThrow(
      /mutually exclusive/,
    );
  });
});
