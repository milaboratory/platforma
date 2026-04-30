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
  // Dataset B has no filters — filter dropdown must stay hidden.
  { primary: { label: "Dataset B", ref: datasetB } },
];

const datasetC = createPlRef("3", "out-c", true);

const optionsNoFilters: DatasetOption[] = [{ primary: { label: "Dataset B", ref: datasetB } }];

const optionsWithEmptyFilters: DatasetOption[] = [
  { primary: { label: "Dataset C", ref: datasetC }, filters: [] },
];

function selection(
  ref: typeof datasetA,
  filter?: typeof filterA1,
  enrichments?: typeof enrichmentsA,
): DatasetSelection {
  return createDatasetSelection(createPrimaryRef(ref, filter), enrichments);
}

async function pickOption(index: number) {
  const options = [...document.body.querySelectorAll(".dropdown-list-item")] as HTMLElement[];
  options[index].click();
  await flushPromises();
}

describe("PlDatasetSelector", () => {
  it("renders a single dropdown when no dataset has filters", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: { modelValue: undefined, options: optionsNoFilters },
      attachTo: document.body,
    });
    await flushPromises();

    const selector = wrapper.find(".pl-dataset-selector");
    expect(selector.exists()).toBe(true);
    // Only PlDropdownRef is rendered — no filter dropdown.
    expect(selector.element.children.length).toBe(1);
    wrapper.unmount();
  });

  it("shows the filter dropdown when the selected dataset has filters", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: { modelValue: selection(datasetA), options: optionsWithFilters },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.find(".pl-dataset-selector").element.children.length).toBe(2);
    wrapper.unmount();
  });

  it("hides the filter dropdown when the selected dataset has no filters", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: { modelValue: selection(datasetB), options: optionsWithFilters },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.find(".pl-dataset-selector").element.children.length).toBe(1);
    wrapper.unmount();
  });

  it("emits DatasetSelection bundling primary + enrichments when dataset changes", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: selection(datasetA, filterA1, enrichmentsA),
        options: optionsWithFilters,
        "onUpdate:modelValue": (e: DatasetSelection | undefined) =>
          wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    const inputs = wrapper.findAll("input");
    await inputs[0].trigger("focus");
    // Dataset A is index 0; pick Dataset B (index 1) — has no enrichments.
    await pickOption(1);

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeDefined();
    const last = emitted![emitted!.length - 1][0] as DatasetSelection;
    expect(last).toEqual({
      __isDatasetSelection: "v1",
      primary: { __isPrimaryRef: "v1", column: datasetB },
    });
    wrapper.unmount();
  });

  it("emits DatasetSelection with filter set when a filter is picked", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: selection(datasetA, undefined, enrichmentsA),
        options: optionsWithFilters,
        "onUpdate:modelValue": (e: DatasetSelection | undefined) =>
          wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    const inputs = wrapper.findAll("input");
    expect(inputs.length).toBe(2);
    await inputs[1].trigger("focus");
    // Options: [No filter, Top 1000, High quality]. Pick "Top 1000".
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

  it("emits DatasetSelection with no filter key when 'No filter' is picked", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: selection(datasetA, filterA1, enrichmentsA),
        options: optionsWithFilters,
        "onUpdate:modelValue": (e: DatasetSelection | undefined) =>
          wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    const inputs = wrapper.findAll("input");
    await inputs[1].trigger("focus");
    await pickOption(0); // "No filter"

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeDefined();
    const last = emitted![emitted!.length - 1][0] as DatasetSelection;
    expect(last.primary).toEqual({ __isPrimaryRef: "v1", column: datasetA });
    expect("filter" in last.primary).toBe(false);
    expect(last.enrichments).toEqual(enrichmentsA);
    wrapper.unmount();
  });

  it("hides filter dropdown when dataset has filters: [] (empty array)", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: { modelValue: selection(datasetC), options: optionsWithEmptyFilters },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.find(".pl-dataset-selector").element.children.length).toBe(1);
    wrapper.unmount();
  });

  it("does not emit on mount when no filter is selected", async () => {
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

    const inputs = wrapper.findAll("input");
    expect(inputs.length).toBe(2);
    await inputs[1].trigger("focus");
    const items = document.body.querySelectorAll(".dropdown-list-item");
    expect(items.length).toBe(3); // No filter, Top 1000, High quality
    expect(items[0].textContent).toContain("No filter");
    wrapper.unmount();
  });

  it("emits DatasetSelection without enrichments when the option carries none", async () => {
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

    const inputs = wrapper.findAll("input");
    await inputs[0].trigger("focus");
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

  it("emits undefined when cleared via the dataset dropdown", async () => {
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
});
