import { createGlobalPObjectId, type BlockColumnLinks } from "@platforma-sdk/model";
import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import { computed, nextTick, shallowRef } from "vue";

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

const { PlBlockDependencies } = await import("./index");
const { columnLinksKey } = await import("../../columnLinks");

const PATH = createGlobalPObjectId("samples", "metadata.path");

const links: BlockColumnLinks = {
  blockId: "samples",
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

  test("folds the warning to one line, and keeps it folded when the block opens again", async () => {
    const folded = { ...links, blockId: "folded" };
    const wrapper = mountWith(computed(() => folded));
    await wrapper.find("[data-testid='pl-block-dependencies-hide']").trigger("click");

    const show = wrapper.find("[data-testid='pl-block-dependencies-show']");
    expect(show.text()).toBe("Show 1 block");
    expect(wrapper.text()).not.toContain("Enrichment");

    const reopened = mountWith(computed(() => folded));
    expect(reopened.find("[data-testid='pl-block-dependencies-show']").exists()).toBe(true);
    expect(reopened.find("[data-testid='pl-block-dependencies-updated']").exists()).toBe(false);
  });

  test("marks a folded warning updated once it says something else, until it is read", async () => {
    const current = shallowRef<BlockColumnLinks>({ ...links, blockId: "updated" });
    const wrapper = mountWith(current);
    await wrapper.find("[data-testid='pl-block-dependencies-hide']").trigger("click");

    current.value = withDependent(current.value, "dca", "DCA");
    await nextTick();
    expect(wrapper.find("[data-testid='pl-block-dependencies-updated']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='pl-block-dependencies-show']").text()).toContain(
      "Show 2 blocks",
    );

    await wrapper.find("[data-testid='pl-block-dependencies-show']").trigger("click");
    expect(wrapper.text()).toContain("DCA");
    await wrapper.find("[data-testid='pl-block-dependencies-hide']").trigger("click");
    expect(wrapper.find("[data-testid='pl-block-dependencies-updated']").exists()).toBe(false);
  });
});

// Internals

function mountWith(columnLinks: { readonly value: BlockColumnLinks }) {
  return mount(PlBlockDependencies, {
    global: { provide: { [columnLinksKey]: computed(() => columnLinks.value) } },
  });
}

function withDependent(of: BlockColumnLinks, blockId: string, label: string): BlockColumnLinks {
  const [item] = of.dependents.items;
  if (item === undefined) throw new Error("The links have no dependent to copy");
  return {
    ...of,
    dependents: {
      ...of.dependents,
      items: [...of.dependents.items, { ...item, dependentBlockId: blockId }],
      labels: { ...of.dependents.labels, [blockId]: label },
    },
  };
}
