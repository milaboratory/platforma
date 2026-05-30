import { describe, expect, test } from "vitest";
import type { PlTableColumnIdJson } from "@platforma-sdk/model";
import { computeVisibilityDeviations, type ColumnVisibilityState } from "./column-visibility";

const id = (s: string): PlTableColumnIdJson => s as PlTableColumnIdJson;

describe("computeVisibilityDeviations", () => {
  test("records no deviations when every column matches its block default", () => {
    const cols: ColumnVisibilityState[] = [
      { colId: id("a"), hidden: false, optional: false }, // default-visible and shown
      { colId: id("b"), hidden: true, optional: true }, // default-optional and hidden
    ];
    expect(computeVisibilityDeviations(cols)).toEqual({ hiddenColIds: [], shownColIds: [] });
  });

  test("records a hide deviation when the user hides a default-visible column", () => {
    const cols: ColumnVisibilityState[] = [{ colId: id("a"), hidden: true, optional: false }];
    expect(computeVisibilityDeviations(cols)).toEqual({
      hiddenColIds: [id("a")],
      shownColIds: [],
    });
  });

  test("records a show deviation when the user shows a default-optional column", () => {
    const cols: ColumnVisibilityState[] = [{ colId: id("a"), hidden: false, optional: true }];
    expect(computeVisibilityDeviations(cols)).toEqual({
      hiddenColIds: [],
      shownColIds: [id("a")],
    });
  });

  test("separates hide and show deviations across a mixed column set", () => {
    const cols: ColumnVisibilityState[] = [
      { colId: id("keep"), hidden: false, optional: false },
      { colId: id("hideMe"), hidden: true, optional: false },
      { colId: id("showMe"), hidden: false, optional: true },
      { colId: id("stayHidden"), hidden: true, optional: true },
    ];
    expect(computeVisibilityDeviations(cols)).toEqual({
      hiddenColIds: [id("hideMe")],
      shownColIds: [id("showMe")],
    });
  });

  // MILAB-6002: when the user has made no overrides, deviations are empty regardless
  // of the defaults — this is what lets persisted state stay stable across re-runs.
  test("an all-default column set yields empty deviations (stable across re-runs)", () => {
    const cols: ColumnVisibilityState[] = [
      { colId: id("x"), hidden: true, optional: true },
      { colId: id("y"), hidden: false, optional: false },
    ];
    const deviations = computeVisibilityDeviations(cols);
    expect(deviations.hiddenColIds).toHaveLength(0);
    expect(deviations.shownColIds).toHaveLength(0);
  });
});
