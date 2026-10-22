import type {
  ColumnUniversalId,
  ColumnValueOption,
  ColumnValuesSource,
  PFrameHandle,
} from "@platforma-sdk/model";
import {
  createColumnValueId,
  createGlobalPObjectId,
  readColumnValueOptions,
} from "@platforma-sdk/model";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick, shallowRef } from "vue";
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
  test("is undefined while no column is picked", () => {
    const { state } = setup({ column: undefined, source: undefined });
    expect(state.value).toBeUndefined();
  });

  test("reads the options of the picked column through its frame", async () => {
    read.mockResolvedValue([R1]);
    const { state } = setup({ column: ROUND, source: present(ROUND) });

    expect(state.value).toEqual({ type: "loading" });
    await settle();
    expect(state.value).toEqual({ type: "read", options: [R1] });
    expect(read).toHaveBeenCalledWith(present(ROUND));
  });

  test("is loading while the source describes an earlier pick or is resolving", () => {
    expect(setup({ column: ROUND, source: present(DONOR) }).state.value).toEqual({
      type: "loading",
    });
    expect(
      setup({ column: ROUND, source: { type: "resolving", column: ROUND } }).state.value,
    ).toEqual({ type: "loading" });
    expect(read).not.toHaveBeenCalled();
  });

  test("is absent once the picked column is gone", () => {
    const { state } = setup({ column: ROUND, source: { type: "absent", column: ROUND } });
    expect(state.value).toEqual({ type: "absent" });
  });

  test("tells why the values could not be read", async () => {
    read.mockRejectedValue(new Error("no driver"));
    const { state } = setup({ column: ROUND, source: present(ROUND) });

    await settle();
    expect(state.value).toEqual({ type: "failed", message: "no driver" });
  });

  test("drops the values of an earlier pick that arrive late", async () => {
    let resolveRound: (options: ColumnValueOption[]) => void = () => {};
    read.mockReturnValueOnce(new Promise((resolve) => (resolveRound = resolve)));
    read.mockResolvedValueOnce([DONOR_A]);
    const { state, column, source } = setup({ column: ROUND, source: present(ROUND) });

    column.value = DONOR;
    source.value = present(DONOR);
    await settle();
    resolveRound([R1]);
    await settle();

    expect(state.value).toEqual({ type: "read", options: [DONOR_A] });
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

function present(column: ColumnUniversalId): ColumnValuesSource {
  return { type: "present", column, frame: `frame-of-${column}` as PFrameHandle };
}

function setup(initial: {
  column: ColumnUniversalId | undefined;
  source: ColumnValuesSource | undefined;
}) {
  const column = shallowRef(initial.column);
  const source = shallowRef(initial.source);
  const state = useColumnValueOptions({ column: () => column.value, source: () => source.value });
  return { state, column, source };
}

async function settle() {
  await nextTick();
  await Promise.resolve();
}
