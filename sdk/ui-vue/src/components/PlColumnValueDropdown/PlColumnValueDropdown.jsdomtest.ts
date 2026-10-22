import type {
  ColumnValueOption,
  ColumnValueOptionsModel,
  PFrameHandle,
} from "@platforma-sdk/model";
import {
  createColumnValueId,
  createGlobalPObjectId,
  readColumnValueOptions,
} from "@platforma-sdk/model";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";

// uikit reads the theme from localStorage on import, which this jsdom setup lacks.
vi.hoisted(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
});

vi.mock("@platforma-sdk/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platforma-sdk/model")>()),
  readColumnValueOptions: vi.fn(),
}));

vi.mock("../../composition/useOpenBlock", () => ({ useOpenBlock: () => undefined }));

const { PlColumnValueDropdown, PlColumnValueDropdownMulti } = await import("./index");

const read = vi.mocked(readColumnValueOptions);

beforeEach(() => {
  read.mockReset();
});

describe("PlColumnValueDropdown", () => {
  test("offers the values of the column once they are read", async () => {
    read.mockResolvedValue([R1, R2]);
    const wrapper = mount(PlColumnValueDropdown, {
      props: { source: PRESENT, valueColumn: ROUND, label: "Round" },
    });

    const dropdown = innermost(wrapper.findAllComponents({ name: "PlDropdown" }));
    expect(dropdown.props("options")).toBeUndefined();
    expect(dropdown.props("label")).toBe("Round");
    await flushPromises();
    expect(dropdown.props("options")).toEqual([R1, R2]);
  });

  test("tells why a column that is gone offers no values", () => {
    const wrapper = mount(PlColumnValueDropdown, {
      props: { source: { type: "absent", valueColumn: ROUND }, valueColumn: ROUND },
    });

    const dropdown = innermost(wrapper.findAllComponents({ name: "PlDropdown" }));
    expect(dropdown.props("options")).toEqual([]);
    expect(dropdown.props("error")).toBe("The picked column is not available");
  });

  test("passes the pick through", async () => {
    read.mockResolvedValue([R1, R2]);
    const onUpdate = vi.fn();
    const wrapper = mount(PlColumnValueDropdown, {
      props: { source: PRESENT, modelValue: R1.value, "onUpdate:modelValue": onUpdate },
    });
    await flushPromises();

    const dropdown = innermost(wrapper.findAllComponents({ name: "PlDropdown" }));
    expect(dropdown.props("modelValue")).toBe(R1.value);
    dropdown.vm.$emit("update:modelValue", R2.value);
    expect(onUpdate).toHaveBeenCalledWith(R2.value);
  });
});

describe("PlColumnValueDropdownMulti", () => {
  test("does not offer the values it is told to leave out", async () => {
    read.mockResolvedValue([R1, R2]);
    const wrapper = mount(PlColumnValueDropdownMulti, {
      props: { source: PRESENT, modelValue: [], exclude: [R1.value] },
    });
    await flushPromises();

    expect(
      innermost(wrapper.findAllComponents({ name: "PlDropdownMulti" })).props("options"),
    ).toEqual([R2]);
  });

  test("passes its slots to the dropdown", () => {
    read.mockResolvedValue([]);
    const wrapper = mount(PlColumnValueDropdownMulti, {
      props: { source: PRESENT, modelValue: [], label: "Rounds" },
      slots: { tooltip: "Pick the rounds to compare" },
    });

    const dropdown = innermost(wrapper.findAllComponents({ name: "PlDropdownMulti" }));
    expect(Object.keys(dropdown.vm.$slots)).toEqual(["tooltip"]);
  });

  test("keeps the error the caller gives over the reason of the column", async () => {
    read.mockRejectedValue(new Error("no driver"));
    const wrapper = mount(PlColumnValueDropdownMulti, {
      props: { source: PRESENT, modelValue: [R1.value], error: "Pick a round" },
    });
    await flushPromises();

    const dropdown = innermost(wrapper.findAllComponents({ name: "PlDropdownMulti" }));
    expect(dropdown.props("options")).toEqual([]);
    expect(dropdown.props("error")).toBe("Pick a round");
    expect(dropdown.props("modelValue")).toEqual([R1.value]);
  });
});

// Internals

const ROUND = createGlobalPObjectId("samples", "pf.metadata.round");

const PRESENT: ColumnValueOptionsModel = {
  type: "present",
  valueColumn: ROUND,
  frame: "frame-of-round" as PFrameHandle,
  frameColumns: { value: ROUND, label: null },
};

const R1: ColumnValueOption = {
  value: createColumnValueId({ column: ROUND, value: "R1" }),
  label: "R1",
};

const R2: ColumnValueOption = {
  value: createColumnValueId({ column: ROUND, value: "R2" }),
  label: "R2",
};

/** The uikit dropdown itself, below the wrapper of the same name that gives it the column links hint. */
function innermost<T>(found: T[]): T {
  const dropdown = found.at(-1);
  if (dropdown === undefined) throw new Error("No dropdown is rendered");
  return dropdown;
}
