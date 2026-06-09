import { describe, expect, test } from "vitest";
import { isJsonEqual } from "@milaboratories/helpers";
import { resolveColumnHidden, type PlTableColumnIdJson } from "@platforma-sdk/model";
import {
  computeVisibilityDeviations,
  deriveColumnVisibility,
  type ColumnVisibilityState,
} from "./column-visibility";

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

  // The same logical deviation set must serialise identically regardless of the live
  // grid column order, otherwise the reload watch (order-sensitive isJsonEqual on the
  // persisted vs current state) fires a spurious grid reload on a pure column reorder.
  test("output is order-stable across a column reorder", () => {
    const order1: ColumnVisibilityState[] = [
      { colId: id("a"), hidden: true, optional: false },
      { colId: id("b"), hidden: true, optional: false },
      { colId: id("c"), hidden: false, optional: true },
      { colId: id("d"), hidden: false, optional: true },
    ];
    const order2: ColumnVisibilityState[] = [order1[3], order1[1], order1[0], order1[2]];
    expect(
      isJsonEqual(computeVisibilityDeviations(order1), computeVisibilityDeviations(order2)),
    ).toBe(true);
    expect(computeVisibilityDeviations(order1)).toEqual({
      hiddenColIds: [id("a"), id("b")],
      shownColIds: [id("c"), id("d")],
    });
  });
});

describe("deriveColumnVisibility", () => {
  const prev = { hiddenColIds: [id("X")], shownColIds: [] };

  // MILAB-6002 #1: the grid is created without column defs and only receives them once
  // calculateGridOptions resolves. A grid state event in that window (or on teardown)
  // reports zero columns; deriving from an empty set must NOT wipe saved deviations.
  test("an empty live-column set keeps the prior persisted deviations", () => {
    expect(deriveColumnVisibility([], prev)).toEqual(prev);
    expect(deriveColumnVisibility([], undefined)).toBeUndefined();
  });

  test("a non-empty column set derives fresh deviations, ignoring prior", () => {
    const cols: ColumnVisibilityState[] = [{ colId: id("a"), hidden: true, optional: false }];
    expect(deriveColumnVisibility(cols, prev)).toEqual({
      hiddenColIds: [id("a")],
      shownColIds: [],
    });
  });

  test("no deviations collapse to undefined (all columns follow their default)", () => {
    const cols: ColumnVisibilityState[] = [
      { colId: id("a"), hidden: false, optional: false },
      { colId: id("b"), hidden: true, optional: true },
    ];
    expect(deriveColumnVisibility(cols, prev)).toBeUndefined();
  });
});

// MILAB-6002 #2 — KNOWN LIMITATION of the pure-deviation model, pinned so a future
// change is noticed. resolveColumnHidden (model) and computeVisibilityDeviations (UI)
// form the save/load cycle. When a user-hidden column's default later flips to optional,
// the override coincides with the default and is dropped (cannot be distinguished from
// "following the default"); if the default flips back the column reappears. Preserving it
// would require storing more than deviations. If the product decides hides must survive,
// update this test and the model.
describe("explicit hide is absorbed when the default flips to optional and back", () => {
  const X = "X" as PlTableColumnIdJson;

  // One block run: load visibility (makeColDef -> resolveColumnHidden), optionally apply
  // a user toggle, then re-derive the deviations from the resulting grid state.
  function run(optional: boolean, hidden: Set<string>, shown: Set<string>, userHides?: boolean) {
    let isHidden = resolveColumnHidden({
      forcedHidden: false,
      optional,
      userShown: shown.has(X),
      userHidden: hidden.has(X),
    });
    if (userHides !== undefined) isHidden = userHides;
    const dev = computeVisibilityDeviations([{ colId: X, hidden: isHidden, optional }]);
    return { isHidden, hidden: new Set(dev.hiddenColIds), shown: new Set(dev.shownColIds) };
  }

  test("the run-1 hide does not survive an optional flip-and-back (documented loss)", () => {
    const r1 = run(/* optional */ false, new Set(), new Set(), /* userHides */ true);
    expect([...r1.hidden]).toEqual(["X"]); // hide recorded

    const r2 = run(/* optional */ true, r1.hidden, r1.shown); // default flips optional
    expect(r2.isHidden).toBe(true); // still hidden this run (userHidden wins)...
    expect([...r2.hidden]).toEqual([]); // ...but the deviation is dropped (coincides with default)

    const r3 = run(/* optional */ false, r2.hidden, r2.shown); // default flips back to visible
    expect(r3.isHidden).toBe(false); // current behavior: the column reappears
  });
});
