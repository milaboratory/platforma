import { flushPromises, mount } from "@vue/test-utils";
import type { DatasetOption, PrimaryRef } from "@platforma-sdk/model";
import { createPlRef, createPrimaryRef } from "@platforma-sdk/model";
import { describe, expect, it } from "vitest";
import PlDatasetSelector from "../PlDatasetSelector.vue";

const datasetA = createPlRef("1", "out-a", true);
const datasetB = createPlRef("2", "out-b", true);
const filterA1 = createPlRef("1", "filter-a1");
const filterA2 = createPlRef("1", "filter-a2");

const optionsWithFilters: DatasetOption[] = [
  {
    label: "Dataset A",
    ref: datasetA,
    filters: [
      { label: "Top 1000", ref: filterA1 },
      { label: "High quality", ref: filterA2 },
    ],
  },
  // Dataset B has no filters — filter dropdown must stay hidden.
  { label: "Dataset B", ref: datasetB },
];

const datasetC = createPlRef("3", "out-c", true);

const optionsNoFilters: DatasetOption[] = [{ label: "Dataset B", ref: datasetB }];

const optionsWithEmptyFilters: DatasetOption[] = [
  { label: "Dataset C", ref: datasetC, filters: [] },
];

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
      props: { modelValue: createPrimaryRef(datasetA), options: optionsWithFilters },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.find(".pl-dataset-selector").element.children.length).toBe(2);
    wrapper.unmount();
  });

  it("hides the filter dropdown when the selected dataset has no filters", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: { modelValue: createPrimaryRef(datasetB), options: optionsWithFilters },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.find(".pl-dataset-selector").element.children.length).toBe(1);
    wrapper.unmount();
  });

  it("emits PrimaryRef with filter: undefined when dataset changes", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: createPrimaryRef(datasetA, filterA1),
        options: optionsWithFilters,
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    // Open the dataset dropdown (the first input — dataset comes first).
    const inputs = wrapper.findAll("input");
    await inputs[0].trigger("focus");

    // Dataset A is already selected (index 0); pick Dataset B (index 1).
    await pickOption(1);

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeDefined();
    const last = emitted![emitted!.length - 1][0] as PrimaryRef;
    expect(last).toEqual({ __isPrimaryRef: "v1", column: datasetB });
    wrapper.unmount();
  });

  it("emits PrimaryRef with filter set when a filter is picked", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: createPrimaryRef(datasetA),
        options: optionsWithFilters,
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    // Open the filter dropdown — it's the second input in the component.
    const inputs = wrapper.findAll("input");
    expect(inputs.length).toBe(2);
    await inputs[1].trigger("focus");

    // Options are: [No filter, Top 1000, High quality]. Pick "Top 1000" (index 1).
    await pickOption(1);

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeDefined();
    const last = emitted![emitted!.length - 1][0] as PrimaryRef;
    expect(last).toEqual({ __isPrimaryRef: "v1", column: datasetA, filter: filterA1 });
    wrapper.unmount();
  });

  it("emits PrimaryRef with filter: undefined when 'No filter' is picked", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: createPrimaryRef(datasetA, filterA1),
        options: optionsWithFilters,
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    const inputs = wrapper.findAll("input");
    await inputs[1].trigger("focus");
    // Pick "No filter" (index 0).
    await pickOption(0);

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeDefined();
    const last = emitted![emitted!.length - 1][0] as PrimaryRef;
    expect(last).toEqual({ __isPrimaryRef: "v1", column: datasetA });
    expect("filter" in last).toBe(false);
    wrapper.unmount();
  });

  it("accepts plain PlRef as modelValue for backward compat (filterless dataset)", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: { modelValue: datasetB, options: optionsWithFilters },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.find(".pl-dataset-selector").element.children.length).toBe(1);
    wrapper.unmount();
  });

  it("accepts plain PlRef as modelValue for backward compat (dataset with filters)", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: { modelValue: datasetA, options: optionsWithFilters },
      attachTo: document.body,
    });
    await flushPromises();

    // PlRef matching dataset A — filter dropdown should appear since A has filters.
    expect(wrapper.find(".pl-dataset-selector").element.children.length).toBe(2);
    wrapper.unmount();
  });

  it("hides filter dropdown when dataset has filters: [] (empty array)", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: { modelValue: createPrimaryRef(datasetC), options: optionsWithEmptyFilters },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.find(".pl-dataset-selector").element.children.length).toBe(1);
    wrapper.unmount();
  });

  it("filter dropdown defaults to 'No filter' when dataset has filters but none selected", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: createPrimaryRef(datasetA),
        options: optionsWithFilters,
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    // No emission on mount — the component does not auto-select a filter.
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();

    // Filter dropdown is visible.
    const inputs = wrapper.findAll("input");
    expect(inputs.length).toBe(2);

    // Open filter dropdown and verify "No filter" is the first option.
    await inputs[1].trigger("focus");
    const items = document.body.querySelectorAll(".dropdown-list-item");
    expect(items.length).toBe(3); // No filter, Top 1000, High quality
    expect(items[0].textContent).toContain("No filter");
    wrapper.unmount();
  });

  it("emits PrimaryRef without filter key when selecting a filterless dataset", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: undefined,
        options: optionsNoFilters,
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    const inputs = wrapper.findAll("input");
    await inputs[0].trigger("focus");
    await pickOption(0);

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeDefined();
    const last = emitted![emitted!.length - 1][0] as PrimaryRef;
    expect(last).toEqual({ __isPrimaryRef: "v1", column: datasetB });
    expect("filter" in last).toBe(false);
    wrapper.unmount();
  });

  it("emits undefined when cleared via the dataset dropdown", async () => {
    const wrapper = mount(PlDatasetSelector, {
      props: {
        modelValue: createPrimaryRef(datasetA, filterA1),
        options: optionsWithFilters,
        clearable: true,
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
      },
      attachTo: document.body,
    });
    await flushPromises();

    // PlDropdown's clear button carries the ".clear" class.
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
