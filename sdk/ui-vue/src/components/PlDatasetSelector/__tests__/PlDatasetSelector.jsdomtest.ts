import { flushPromises, mount } from "@vue/test-utils";
import type { DatasetOption, DatasetSelection } from "@platforma-sdk/model";
import { createDatasetSelection, createPlRef, createPrimaryRef } from "@platforma-sdk/model";
import { describe, expect, it } from "vitest";
import PlDatasetSelector from "../PlDatasetSelector.vue";

const datasetA = createPlRef("1", "out-a", true);
const datasetB = createPlRef("2", "out-b", true);
const filterA1 = createPlRef("1", "filter-a1");
const filterA2 = createPlRef("1", "filter-a2");

import type { PObjectId } from "@platforma-sdk/model";
const enrichmentA = "enrichment-a" as PObjectId;
const enrichmentsA = [
  { ref: { __isEnrichment: "v1" as const, hit: enrichmentA }, label: "Enrichment A" },
];

const optionsWithFilters: DatasetOption[] = [
  {
    primary: { label: "Dataset A", ref: datasetA },
    filters: [
      { label: "Top 1000", ref: filterA1 },
      { label: "High quality", ref: filterA2 },
    ],
    enrichments: enrichmentsA,
  },
  // Dataset B has no filters — it appears as a single row with no children.
  { primary: { label: "Dataset B", ref: datasetB } },
];

const optionsNoFilters: DatasetOption[] = [{ primary: { label: "Dataset B", ref: datasetB } }];

function selection(
  ref: typeof datasetA,
  filter?: typeof filterA1,
  enrichments?: typeof enrichmentsA,
): DatasetSelection {
  return createDatasetSelection(createPrimaryRef(ref, filter), enrichments);
}

async function pickOption(index: number) {
  const items = [...document.body.querySelectorAll(".dropdown-list-item")] as HTMLElement[];
  items[index].click();
  await flushPromises();
}

describe("PlDatasetSelector", () => {
  it("renders a single dropdown that lists datasets and filters together", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: { modelValue: undefined, options: optionsWithFilters },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.findAll("input").length).toBe(1);
    await wrapper.find("input").trigger("focus");

    const items = document.body.querySelectorAll(".dropdown-list-item");
    // Dataset A + 2 filters under it + Dataset B.
    expect(items.length).toBe(4);
    wrapper.unmount();
  });

  it("uses the filter option's label as the row's display label", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: { modelValue: undefined, options: optionsWithFilters },
      attachTo: document.body,
    });
    await flushPromises();

    await wrapper.find("input").trigger("focus");
    const items = [...document.body.querySelectorAll(".dropdown-list-item")] as HTMLElement[];
    expect(items[1].textContent).toContain("Top 1000");
    expect(items[2].textContent).toContain("High quality");
    wrapper.unmount();
  });

  it("emits DatasetSelection bundling primary + enrichments when a dataset is picked", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: undefined,
        options: optionsWithFilters,
        "onUpdate:modelValue": (e: DatasetSelection | undefined) =>
          wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    await wrapper.find("input").trigger("focus");
    // Items in order: Dataset A, filterA1, filterA2, Dataset B.
    await pickOption(0);

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeDefined();
    const last = emitted![emitted!.length - 1][0] as DatasetSelection;
    expect(last).toEqual({
      __isDatasetSelection: "v1",
      primary: { __isPrimaryRef: "v1", column: datasetA },
      enrichments: enrichmentsA,
    });
    wrapper.unmount();
  });

  it("emits DatasetSelection with filter set when a filter row is picked", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: undefined,
        options: optionsWithFilters,
        "onUpdate:modelValue": (e: DatasetSelection | undefined) =>
          wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    await wrapper.find("input").trigger("focus");
    // Pick filterA1 — index 1 in the flat list.
    await pickOption(1);

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeDefined();
    const last = emitted![emitted!.length - 1][0] as DatasetSelection;
    expect(last).toEqual({
      __isDatasetSelection: "v1",
      primary: { __isPrimaryRef: "v1", column: datasetA, filter: filterA1 },
      enrichments: enrichmentsA,
    });
    wrapper.unmount();
  });

  it("emits DatasetSelection without enrichments when the picked option carries none", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: undefined,
        options: optionsNoFilters,
        "onUpdate:modelValue": (e: DatasetSelection | undefined) =>
          wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    await wrapper.find("input").trigger("focus");
    await pickOption(0);

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeDefined();
    const last = emitted![emitted!.length - 1][0] as DatasetSelection;
    expect(last).toEqual({
      __isDatasetSelection: "v1",
      primary: { __isPrimaryRef: "v1", column: datasetB },
    });
    expect("enrichments" in last).toBe(false);
    wrapper.unmount();
  });

  it("emits undefined when cleared", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: selection(datasetA, filterA1, enrichmentsA),
        options: optionsWithFilters,
        clearable: true,
        "onUpdate:modelValue": (e: DatasetSelection | undefined) =>
          wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    const clearBtn = wrapper.find(".clear");
    expect(clearBtn.exists()).toBe(true);
    await clearBtn.trigger("click");

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeDefined();
    const last = emitted![emitted!.length - 1][0];
    expect(last).toBeUndefined();
    wrapper.unmount();
  });

  it("does not emit on mount when a value is provided", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: selection(datasetA),
        options: optionsWithFilters,
        "onUpdate:modelValue": (e: DatasetSelection | undefined) =>
          wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });
});
