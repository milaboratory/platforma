import { createGlobalPObjectId, type BlockColumnLinks } from "@platforma-sdk/model";
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

vi.mock("../../defineApp", () => ({ columnLinksKey: Symbol("column-links") }));
vi.mock("../../composition/useOpenBlock", () => ({ useOpenBlock: () => undefined }));

const { PlBlockDependencies } = await import("./index");
const { columnLinksKey } = await import("../../defineApp");

const PATH = createGlobalPObjectId("samples", "metadata.path");

const links: BlockColumnLinks = {
  dependencies: { argsSource: "current", items: [], labels: {} },
  dependents: {
    items: [
      {
        dependentBlockId: "enrichment",
        output: "metadata.path",
        ref: PATH,
        values: null,
        columnLabel: "Path",
        status: { type: "broken", reason: "notExported" },
      },
    ],
    hasUnrunChanges: false,
    labels: { enrichment: "Enrichment" },
  },
};

describe("PlBlockDependencies", () => {
  test("shows nothing outside a block", () => {
    const wrapper = mount(PlBlockDependencies);
    expect(wrapper.find("[data-testid^='pl-block-dependencies-alert']").exists()).toBe(false);
  });

  test("warns about blocks using an output the block does not export", () => {
    const wrapper = mount(PlBlockDependencies, {
      global: { provide: { [columnLinksKey]: computed(() => links) } },
    });
    const alert = wrapper.find("[data-testid='pl-block-dependencies-alert-usedBy']");
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain("Enrichment");
  });
});
