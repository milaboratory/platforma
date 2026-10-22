import type {
  ColumnUniversalId,
  ColumnValueOption,
  ColumnValueOptionsModel,
  PFrameHandle,
} from "@platforma-sdk/model";
import {
  createColumnValueId,
  createGlobalPObjectId,
  readColumnValueOptions,
} from "@platforma-sdk/model";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick, shallowRef } from "vue";
import { usePlColumnValueOptions } from "./usePlColumnValueOptions";

vi.mock("@platforma-sdk/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platforma-sdk/model")>()),
  readColumnValueOptions: vi.fn(),
}));

const read = vi.mocked(readColumnValueOptions);

beforeEach(() => {
  read.mockReset();
});

describe("usePlColumnValueOptions", () => {
  test("offers nothing while no column is picked", () => {
    const { values } = setup({ valueColumn: undefined, source: undefined });
    expect(values.state.value).toBeUndefined();
    expect(values.options.value).toBeUndefined();
    expect(values.error.value).toBeUndefined();
  });

  test("reads the options of the picked column through its frame", async () => {
    read.mockResolvedValue([R1]);
    const { values } = setup({ valueColumn: ROUND, source: present(ROUND) });

    expect(values.state.value).toEqual({ type: "loading" });
    expect(values.options.value).toBeUndefined();
    await settle();
    expect(values.state.value).toEqual({ type: "read", options: [R1] });
    expect(values.options.value).toEqual([R1]);
    expect(read).toHaveBeenCalledWith(present(ROUND));
  });

  test("is loading while the source describes an earlier pick, is not computed, or is resolving", () => {
    expect(setup({ valueColumn: ROUND, source: present(DONOR) }).values.state.value).toEqual({
      type: "loading",
    });
    expect(setup({ valueColumn: ROUND, source: undefined }).values.state.value).toEqual({
      type: "loading",
    });
    expect(
      setup({ valueColumn: ROUND, source: { type: "resolving", valueColumn: ROUND } }).values.state
        .value,
    ).toEqual({ type: "loading" });
    expect(read).not.toHaveBeenCalled();
  });

  test("takes the source as it is when no pick is followed", async () => {
    read.mockResolvedValue([R1]);
    const source = shallowRef<ColumnValueOptionsModel | undefined>(undefined);
    const values = usePlColumnValueOptions({ source: () => source.value });
    expect(values.state.value).toBeUndefined();

    source.value = present(ROUND);
    await settle();
    expect(values.state.value).toEqual({ type: "read", options: [R1] });
  });

  test("offers no options and tells why once the picked column is gone", () => {
    const { values } = setup({
      valueColumn: ROUND,
      source: { type: "absent", valueColumn: ROUND },
    });
    expect(values.state.value).toEqual({ type: "absent" });
    expect(values.options.value).toEqual([]);
    expect(values.error.value).toBe("The picked column is not available");
  });

  test("tells why the values could not be read", async () => {
    read.mockRejectedValue(new Error("no driver"));
    const { values } = setup({ valueColumn: ROUND, source: present(ROUND) });

    await settle();
    expect(values.state.value).toEqual({ type: "failed", message: "no driver" });
    expect(values.options.value).toEqual([]);
    expect(values.error.value).toBe("no driver");
  });

  test("drops the values of an earlier pick that arrive late", async () => {
    let resolveRound: (options: ColumnValueOption[]) => void = () => {};
    read.mockReturnValueOnce(new Promise((resolve) => (resolveRound = resolve)));
    read.mockResolvedValueOnce([DONOR_A]);
    const { values, valueColumn, source } = setup({ valueColumn: ROUND, source: present(ROUND) });

    valueColumn.value = DONOR;
    source.value = present(DONOR);
    await settle();
    resolveRound([R1]);
    await settle();

    expect(values.state.value).toEqual({ type: "read", options: [DONOR_A] });
  });
});

// Internals

const ROUND = createGlobalPObjectId("samples", "pf.metadata.round");

const DONOR = createGlobalPObjectId("samples", "pf.metadata.donor");

const R1: ColumnValueOption = {
  value: createColumnValueId({ column: ROUND, value: "R1" }),
  label: "R1",
};

const DONOR_A: ColumnValueOption = {
  value: createColumnValueId({ column: DONOR, value: "A" }),
  label: "A",
};

function present(valueColumn: ColumnUniversalId): ColumnValueOptionsModel {
  return {
    type: "present",
    valueColumn,
    frame: `frame-of-${valueColumn}` as PFrameHandle,
    frameColumns: { value: createGlobalPObjectId("samples", "frame.column"), label: null },
  };
}

function setup(initial: {
  valueColumn: ColumnUniversalId | undefined;
  source: ColumnValueOptionsModel | undefined;
}) {
  const valueColumn = shallowRef(initial.valueColumn);
  const source = shallowRef(initial.source);
  const values = usePlColumnValueOptions({
    source: () => source.value,
    valueColumn: () => valueColumn.value,
  });
  return { values, valueColumn, source };
}

async function settle() {
  await nextTick();
  await Promise.resolve();
}
