import {
  createDatasetSelection,
  createGlobalPObjectId,
  createPlRef,
  createPrimaryRef,
  type BlockColumnLinks,
  type DatasetOption,
} from "@platforma-sdk/model";
import { flushPromises, mount } from "@vue/test-utils";
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

vi.mock("../../../composition/useOpenBlock", () => ({ useOpenBlock: () => undefined }));

const { default: PlDatasetSelector } = await import("../PlDatasetSelector.vue");
const { columnLinksKey } = await import("../../../columnLinks");

const abundance = createPlRef("mixcr", "clonotypes.abundance", true);
const filter = createPlRef("labeling", "labels.top");

const options: DatasetOption[] = [
  { primary: { label: "Other", ref: createPlRef("mixcr", "clonotypes.other", true) } },
];

function links(producerBlockId: string, output: string): BlockColumnLinks {
  return {
    dependencies: {
      argsSource: "current",
      items: [
        {
          producerBlockId,
          output,
          ref: createGlobalPObjectId(producerBlockId, output),
          values: null,
          columnLabel: "Abundance",
          status: { type: "broken", reason: "unavailable" },
        },
      ],
      labels: { mixcr: "MiXCR Clonotyping", labeling: "Repertoire Labeling" },
    },
    dependents: { items: [], hasUnrunChanges: false, labels: {} },
  };
}

function mountSelector(columnLinks: BlockColumnLinks) {
  return mount(PlDatasetSelector, {
    props: {
      modelValue: createDatasetSelection(createPrimaryRef(abundance, filter)),
      options,
    },
    global: { provide: { [columnLinksKey]: computed(() => columnLinks) } },
  });
}

describe("PlDatasetSelector missing value hint", () => {
  test("explains a missing dataset by the block that was to provide it", async () => {
    const wrapper = mountSelector(links("mixcr", "clonotypes.abundance"));
    await flushPromises();
    expect(wrapper.find("[data-testid='pl-dropdown-value-hint']").exists()).toBe(true);
  });

  test("explains a missing filter of a dataset that is there", async () => {
    const wrapper = mountSelector(links("labeling", "labels.top"));
    await flushPromises();
    expect(wrapper.find("[data-testid='pl-dropdown-value-hint']").exists()).toBe(true);
  });

  test("gives no hint when the links tell nothing about the selection", async () => {
    const wrapper = mountSelector(links("other", "out"));
    await flushPromises();
    expect(wrapper.find("[data-testid='pl-dropdown-value-hint']").exists()).toBe(false);
  });
});
