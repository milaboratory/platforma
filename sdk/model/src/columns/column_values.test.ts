import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createColumnValueId,
  createGlobalPObjectId,
  type PColumn,
  type PColumnValues,
  type PFrameHandle,
} from "@milaboratories/pl-model-common";
import type { GlobalCfgRenderCtx } from "../render/internal";
import { ColumnRecipe } from "./column_recipes";
import {
  createColumnValueOptions,
  deriveColumnValueOptions,
  deriveLabelledColumnValueOptions,
} from "./column_values";

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

describe("deriveLabelledColumnValueOptions", () => {
  test("labels each value by the label of its first row, in natural order of labels", () => {
    const rows = [
      { value: "s2", label: "Donor 10" },
      { value: "s1", label: "Donor 2" },
      { value: "s2", label: "Donor 11" },
    ];
    expect(deriveLabelledColumnValueOptions(COLUMN_ID, rows)).toEqual([
      option("s1", "Donor 2"),
      option("s2", "Donor 10"),
    ]);
  });

  test("leaves a value with an empty label to label itself, and offers no empty value", () => {
    const rows = [
      { value: "s1", label: "" },
      { value: "", label: "Nobody" },
    ];
    expect(deriveLabelledColumnValueOptions(COLUMN_ID, rows)).toEqual([option("s1")]);
  });
});

describe("createColumnValueOptions", () => {
  test("holds a frame of the value column while it is there", () => {
    vi.spyOn(ColumnRecipe, "getStatus").mockReturnValue("present");
    const ctx = renderCtx();

    expect(createColumnValueOptions({ valueColumn: COLUMN_ID }, { ctx })).toEqual({
      type: "present",
      valueColumn: COLUMN_ID,
      frame: FRAME,
      frameColumns: { value: COLUMN_ID, label: null },
    });
    expect(ctx.createPFrame).toHaveBeenCalledWith([COLUMN_ID]);
  });

  test("puts the label column into the frame beside the value column", () => {
    vi.spyOn(ColumnRecipe, "getStatus").mockReturnValue("present");
    const ctx = renderCtx();

    expect(
      createColumnValueOptions({ valueColumn: COLUMN_ID, labelColumn: LABEL_ID }, { ctx }),
    ).toEqual({
      type: "present",
      valueColumn: COLUMN_ID,
      frame: FRAME,
      frameColumns: { value: COLUMN_ID, label: LABEL_ID },
    });
    expect(ctx.createPFrame).toHaveBeenCalledWith([COLUMN_ID, LABEL_ID]);
  });

  test("takes a materialised column as it is", () => {
    const ctx = renderCtx();
    const column: PColumn<PColumnValues> = {
      id: COLUMN_ID,
      spec: {
        kind: "PColumn",
        name: "pl7.app/metadata",
        valueType: "String",
        axesSpec: [{ name: "pl7.app/sampleId", type: "String" }],
      },
      data: [{ key: ["s1"], val: "R1" }],
    };

    expect(createColumnValueOptions({ valueColumn: column }, { ctx })).toMatchObject({
      type: "present",
      valueColumn: COLUMN_ID,
      frameColumns: { value: COLUMN_ID, label: null },
    });
    expect(ctx.createPFrame).toHaveBeenCalledWith([column]);
  });

  test("is resolving while the value column or the label column is", () => {
    vi.spyOn(ColumnRecipe, "getStatus").mockReturnValue("resolving");
    expect(createColumnValueOptions({ valueColumn: COLUMN_ID }, { ctx: renderCtx() })).toEqual({
      type: "resolving",
      valueColumn: COLUMN_ID,
    });

    vi.spyOn(ColumnRecipe, "getStatus").mockImplementation((id) =>
      id === LABEL_ID ? "resolving" : "present",
    );
    const ctx = renderCtx();
    expect(
      createColumnValueOptions({ valueColumn: COLUMN_ID, labelColumn: LABEL_ID }, { ctx }),
    ).toEqual({ type: "resolving", valueColumn: COLUMN_ID });
    expect(ctx.createPFrame).not.toHaveBeenCalled();
  });

  test("is absent once the value column is gone", () => {
    vi.spyOn(ColumnRecipe, "getStatus").mockReturnValue("absent");
    const ctx = renderCtx();

    expect(createColumnValueOptions({ valueColumn: COLUMN_ID }, { ctx })).toEqual({
      type: "absent",
      valueColumn: COLUMN_ID,
    });
    expect(ctx.createPFrame).not.toHaveBeenCalled();
  });

  test("leaves the values to label themselves once the label column is gone", () => {
    vi.spyOn(ColumnRecipe, "getStatus").mockImplementation((id) =>
      id === LABEL_ID ? "absent" : "present",
    );
    const ctx = renderCtx();

    expect(
      createColumnValueOptions({ valueColumn: COLUMN_ID, labelColumn: LABEL_ID }, { ctx }),
    ).toMatchObject({ type: "present", frameColumns: { value: COLUMN_ID, label: null } });
    expect(ctx.createPFrame).toHaveBeenCalledWith([COLUMN_ID]);
  });
});

// Internals

const COLUMN_ID = createGlobalPObjectId("samples", "pf.metadata.round");

const LABEL_ID = createGlobalPObjectId("samples", "pf.metadata.roundName");

const FRAME = "frame-of-round" as PFrameHandle;

function option(value: string, label = value) {
  return { value: createColumnValueId({ column: COLUMN_ID, value }), label };
}

/** A render ctx that creates {@link FRAME} for any columns; only `createPFrame` is called. */
function renderCtx() {
  const createPFrame = vi.fn(() => FRAME);
  return Object.assign({ createPFrame } as GlobalCfgRenderCtx, { createPFrame });
}
