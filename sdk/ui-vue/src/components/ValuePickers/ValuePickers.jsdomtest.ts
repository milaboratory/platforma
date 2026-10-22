import {
  createColumnValueId,
  createGlobalPObjectId,
  type BlockColumnLinks,
} from "@platforma-sdk/model";
import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import { computed } from "vue";

// uikit reads the theme from localStorage on import, which this jsdom setup lacks.
vi.hoisted(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
});

vi.mock("../../composition/useOpenBlock", () => ({ useOpenBlock: () => undefined }));

const { PlValueLabel } = await import("./index");
const { columnLinksKey } = await import("../../columnLinks");

const PATH = createGlobalPObjectId("samples", "metadata.path");
const ty1 = createColumnValueId({ column: PATH, value: "Ty1" });

const links: BlockColumnLinks = {
  dependencies: {
    argsSource: "current",
    items: [
      {
        producerBlockId: "samples",
        output: "metadata.path",
        ref: PATH,
        values: ["Ty1"],
        columnLabel: "Path",
        status: { type: "notRun" },
      },
    ],
    labels: { samples: "Samples" },
  },
  dependents: { items: [], hasUnrunChanges: false, labels: {} },
};

describe("value pickers", () => {
  test("show a missing value without a hint outside a block", () => {
    const wrapper = mount(PlValueLabel, { props: { value: ty1, options: [] } });
    expect(wrapper.text()).toBe("Ty1 — not available");
    expect(wrapper.find("[data-testid='pl-tooltip']").exists()).toBe(false);
  });

  test("explain a missing value by the column links the app provides", () => {
    const wrapper = mount(PlValueLabel, {
      props: { value: ty1, options: [] },
      global: { provide: { [columnLinksKey]: computed(() => links) } },
    });
    expect(wrapper.find("[data-testid='pl-tooltip']").exists()).toBe(true);
  });

  test("show a missing value without a hint while the app gives no column links", () => {
    const wrapper = mount(PlValueLabel, {
      props: { value: ty1, options: [] },
      global: { provide: { [columnLinksKey]: computed(() => undefined) } },
    });
    expect(wrapper.find("[data-testid='pl-tooltip']").exists()).toBe(false);
  });

  test("keep the tooltip the caller gives", () => {
    const wrapper = mount(PlValueLabel, {
      props: {
        value: ty1,
        options: [],
        missingValueTooltip: "Gone",
      },
    });
    expect(wrapper.find("[data-testid='pl-tooltip']").exists()).toBe(true);
  });
});
