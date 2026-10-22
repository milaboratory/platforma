import type {
  ColumnValueOption,
  PFrameHandle,
  PresentColumnValueOptionsModel,
} from "@platforma-sdk/model";
import {
  createColumnValueId,
  createGlobalPObjectId,
  readColumnValueOptions,
} from "@platforma-sdk/model";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick, shallowRef } from "vue";
import type { PlColumnValueSettings } from "./settings";
import { useColumnValueOptions } from "./useColumnValueOptions";

vi.mock("@platforma-sdk/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platforma-sdk/model")>()),
  readColumnValueOptions: vi.fn(),
}));

const read = vi.mocked(readColumnValueOptions);

beforeEach(() => {
  read.mockReset();
});

describe("useColumnValueOptions", () => {
  test("is loading while nothing is picked or the values are pending", () => {
    for (const settings of [{ type: "none" }, { type: "pending" }] as const) {
      const values = useColumnValueOptions(() => settings);
      expect(values.options.value).toBeUndefined();
      expect(values.error.value).toBeUndefined();
    }
    expect(read).not.toHaveBeenCalled();
  });

  test("reads the options through the frame of the settings", async () => {
    read.mockResolvedValue([R1]);
    const values = useColumnValueOptions(() => present(ROUND_MODEL));

    expect(values.options.value).toBeUndefined();
    await settle();
    expect(values.options.value).toEqual([R1]);
    expect(read).toHaveBeenCalledWith(ROUND_MODEL);
  });

  test("offers no options and tells why once the column is gone", () => {
    const values = useColumnValueOptions(() => ({ type: "absent" }));
    expect(values.options.value).toEqual([]);
    expect(values.error.value).toBe("The picked column is not available");
  });

  test("tells why the values could not be read", async () => {
    read.mockRejectedValue(new Error("no driver"));
    const values = useColumnValueOptions(() => present(ROUND_MODEL));

    await settle();
    expect(values.options.value).toEqual([]);
    expect(values.error.value).toBe("no driver");
  });

  test("drops the values of earlier settings that arrive late", async () => {
    let resolveRound: (options: ColumnValueOption[]) => void = () => {};
    read.mockReturnValueOnce(new Promise((resolve) => (resolveRound = resolve)));
    read.mockResolvedValueOnce([DONOR_A]);
    const settings = shallowRef<PlColumnValueSettings>(present(ROUND_MODEL));
    const values = useColumnValueOptions(() => settings.value);

    settings.value = present(DONOR_MODEL);
    await settle();
    resolveRound([R1]);
    await settle();

    expect(values.options.value).toEqual([DONOR_A]);
  });
});

// Internals

const ROUND = createGlobalPObjectId("samples", "pf.metadata.round");

const DONOR = createGlobalPObjectId("samples", "pf.metadata.donor");

const ROUND_MODEL = model(ROUND);

const DONOR_MODEL = model(DONOR);

const R1: ColumnValueOption = {
  value: createColumnValueId({ column: ROUND, value: "R1" }),
  label: "R1",
};

const DONOR_A: ColumnValueOption = {
  value: createColumnValueId({ column: DONOR, value: "A" }),
  label: "A",
};

function model(valueColumn: typeof ROUND): PresentColumnValueOptionsModel {
  return {
    type: "present",
    valueColumn,
    frame: `frame-of-${valueColumn}` as PFrameHandle,
    frameColumns: { value: valueColumn, label: null },
  };
}

function present(model: PresentColumnValueOptionsModel): PlColumnValueSettings {
  return { type: "present", model };
}

async function settle() {
  await nextTick();
  await Promise.resolve();
}
