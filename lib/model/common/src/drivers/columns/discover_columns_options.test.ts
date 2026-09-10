import { describe, test, expect } from "vitest";
import { matchingModeToConstraints, type MatchingMode } from "./discover_columns_options";

const MODES: MatchingMode[] = ["enrichment", "related", "exact"];

describe("matchingModeToConstraints", () => {
  test.each(MODES)("omits reverseLinkers entirely for mode %s when not requested", (mode) => {
    for (const constraints of [
      matchingModeToConstraints(mode),
      matchingModeToConstraints(mode, false),
      matchingModeToConstraints(mode, undefined),
    ]) {
      // Absent, not `false` — the engine defaults to forward, and omitting the
      // key keeps the request wire-identical to what existing callers produce.
      expect("reverseLinkers" in constraints).toBe(false);
    }
  });

  test.each(MODES)("sets reverseLinkers for mode %s when requested", (mode) => {
    expect(matchingModeToConstraints(mode, true).reverseLinkers).toBe(true);
  });

  test.each(MODES)("direction is orthogonal to the axes flags of mode %s", (mode) => {
    const { reverseLinkers: _omitted, ...forward } = matchingModeToConstraints(mode, true);
    // Flipping the direction must not disturb any axes-matching flag.
    expect(forward).toStrictEqual(matchingModeToConstraints(mode));
  });

  test("mode still drives the axes flags independently of direction", () => {
    expect(matchingModeToConstraints("exact", true)).toStrictEqual({
      allowFloatingSourceAxes: false,
      allowFloatingHitAxes: false,
      allowSourceQualifications: false,
      allowHitQualifications: false,
      reverseLinkers: true,
    });
    expect(matchingModeToConstraints("enrichment")).toStrictEqual({
      allowFloatingSourceAxes: true,
      allowFloatingHitAxes: false,
      allowSourceQualifications: true,
      allowHitQualifications: true,
    });
  });
});
