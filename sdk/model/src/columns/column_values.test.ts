import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createColumnValueId,
  createGlobalPObjectId,
  type PFrameHandle,
} from "@milaboratories/pl-model-common";
import { ColumnRecipe } from "./column_recipes";
import type { ColumnValuesCtx } from "./column_values";
import { createColumnValuesSource, deriveColumnValueOptions } from "./column_values";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deriveColumnValueOptions", () => {
  test("offers each distinct value once, in natural order of labels", () => {
    expect(deriveColumnValueOptions(COLUMN_ID, ["R10", "R2", "R10", "Library"])).toEqual([
      option("Library"),
      option("R2"),
      option("R10"),
    ]);
  });

  test("does not offer an empty value", () => {
    expect(deriveColumnValueOptions(COLUMN_ID, ["", "R1"])).toEqual([option("R1")]);
  });

  test("orders digit runs as numbers and text case-insensitively", () => {
    const labels = deriveColumnValueOptions(COLUMN_ID, ["r10", "R009", "b", "A"]).map(
      (o) => o.label,
    );
    expect(labels).toEqual(["A", "b", "R009", "r10"]);
  });

  test("works in a runtime without Intl", async () => {
    vi.resetModules();
    vi.stubGlobal("Intl", undefined);
    try {
      const fresh = await import("./column_values");
      const labels = fresh.deriveColumnValueOptions(COLUMN_ID, ["R10", "R2"]).map((o) => o.label);
      expect(labels).toEqual(["R2", "R10"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("createColumnValuesSource", () => {
  test("holds a frame of the column while it is there", () => {
    vi.spyOn(ColumnRecipe, "getStatus").mockReturnValue("present");
    const ctx = renderCtx(FRAME);

    expect(createColumnValuesSource(ctx, COLUMN_ID)).toEqual({
      type: "present",
      column: COLUMN_ID,
      frame: FRAME,
    });
    expect(ctx.createPFrame).toHaveBeenCalledWith([COLUMN_ID]);
  });

  test("is resolving while the column or its frame is", () => {
    vi.spyOn(ColumnRecipe, "getStatus").mockReturnValue("resolving");
    expect(createColumnValuesSource(renderCtx(FRAME), COLUMN_ID)).toEqual({
      type: "resolving",
      column: COLUMN_ID,
    });

    vi.spyOn(ColumnRecipe, "getStatus").mockReturnValue("present");
    expect(createColumnValuesSource(renderCtx(undefined), COLUMN_ID)).toEqual({
      type: "resolving",
      column: COLUMN_ID,
    });
  });

  test("is absent once the column is gone", () => {
    vi.spyOn(ColumnRecipe, "getStatus").mockReturnValue("absent");
    const ctx = renderCtx(FRAME);

    expect(createColumnValuesSource(ctx, COLUMN_ID)).toEqual({ type: "absent", column: COLUMN_ID });
    expect(ctx.createPFrame).not.toHaveBeenCalled();
  });
});

// Internals

const COLUMN_ID = createGlobalPObjectId("samples", "pf.metadata.round");

const FRAME = "frame-of-round" as PFrameHandle;

function option(value: string) {
  return { value: createColumnValueId({ column: COLUMN_ID, value }), label: value };
}

/** A render ctx that creates `frame` for any columns. */
function renderCtx(frame: PFrameHandle | undefined) {
  return { createPFrame: vi.fn(() => frame) } satisfies ColumnValuesCtx;
}
