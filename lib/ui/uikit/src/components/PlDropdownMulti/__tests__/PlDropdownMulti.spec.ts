import { describe, it, expect } from "vitest";

import { mount, flushPromises } from "@vue/test-utils";
import PlDropdownMulti from "../PlDropdownMulti.vue";

describe("PlDropdownMulti", () => {
  it("modelValue", async () => {
    const wrapper = mount(PlDropdownMulti, {
      props: {
        modelValue: [1],
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
        options: [
          { text: "Option 1", value: 1 },
          { text: "Option 2", value: 2 },
        ],
      },
    });

    await wrapper.find("input").trigger("focus");

    const getOptions = () =>
      [...document.body.querySelectorAll(".dropdown-list-item")] as HTMLElement[];

    const options = getOptions();

    expect(options.length).toBe(2);

    options[1].click();
    await flushPromises();

    expect(wrapper.props("modelValue")).toEqual([1, 2]);

    expect(getOptions().length).toBe(2); // options are not closed after click
  });

  it("renders a missing chip for a modelValue not present in options", async () => {
    const wrapper = mount(PlDropdownMulti, {
      props: {
        modelValue: [1, 999],
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
        options: [
          { text: "Option 1", value: 1 },
          { text: "Option 2", value: 2 },
        ],
      },
    });

    await flushPromises();

    const missingChips = wrapper.findAll(".pl-dropdown-multi__chip--missing");
    expect(missingChips.length).toBe(1);
    expect(missingChips[0].text()).toContain("Value not available");

    // Total chip count: one for valid (1), one for missing (999).
    expect(wrapper.findAll(".pl-chip").length).toBe(2);
  });

  it("emits update:modelValue without the missing value when its chip is closed", async () => {
    const wrapper = mount(PlDropdownMulti, {
      props: {
        modelValue: [1, 999],
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
        options: [{ text: "Option 1", value: 1 }],
      },
    });

    await flushPromises();

    const missingChip = wrapper.find(".pl-dropdown-multi__chip--missing");
    expect(missingChip.exists()).toBe(true);

    await missingChip.find(".pl-chip__close").trigger("click");
    await flushPromises();

    expect(wrapper.props("modelValue")).toEqual([1]);
  });

  it("does not render missing chips while options are loading (options undefined)", async () => {
    const wrapper = mount(PlDropdownMulti, {
      props: { modelValue: [99], options: undefined },
    });
    await flushPromises();
    expect(wrapper.find(".pl-dropdown-multi__chip--missing").exists()).toBe(false);
  });

  it("renders missing chip alongside .disabled root when disabled", async () => {
    const wrapper = mount(PlDropdownMulti, {
      props: {
        modelValue: [999],
        disabled: true,
        options: [{ text: "Option 1", value: 1 }],
      },
    });
    await flushPromises();
    // The SCSS rule `.pl-dropdown-multi.disabled .pl-dropdown-multi__chip--missing
    // .pl-chip__text` needs both selectors. jsdom doesn't resolve specificity, so
    // we only assert the hooks exist.
    expect(wrapper.find(".pl-dropdown-multi.disabled").exists()).toBe(true);
    expect(wrapper.find(".pl-dropdown-multi__chip--missing").exists()).toBe(true);
  });

  it("never renders raw object value in a chip even if missingValueLabel is empty string", async () => {
    const wrapper = mount(PlDropdownMulti, {
      props: {
        modelValue: [{ __isRef: true as const, blockId: "deleted", name: "out" }],
        missingValueLabel: "",
        options: [],
      },
    });
    await flushPromises();
    // With empty label the chip must render empty text, not the raw PlRef JSON.
    expect(wrapper.html()).not.toContain('"blockId"');
    expect(wrapper.html()).not.toContain('"__isRef"');
  });

  it("does not leak raw JSON when a found option has an empty label", async () => {
    const wrapper = mount(PlDropdownMulti, {
      props: {
        modelValue: [{ __isRef: true as const, blockId: "1", name: "Ref" }],
        options: [{ label: "", value: { __isRef: true as const, blockId: "1", name: "Ref" } }],
      },
    });
    await flushPromises();
    // An empty `label` must not produce JSON output via `toDisplayString`.
    expect(wrapper.html()).not.toContain('"blockId"');
    expect(wrapper.html()).not.toContain('"__isRef"');
    // The chip still renders (not the missing branch — option is found).
    expect(wrapper.find(".pl-chip").exists()).toBe(true);
    expect(wrapper.find(".pl-dropdown-multi__chip--missing").exists()).toBe(false);
  });

  it("renders a found option's empty label as empty, never the missing label", async () => {
    const wrapper = mount(PlDropdownMulti, {
      props: {
        modelValue: [1],
        // Distinctive text so a regression to the `|| missingValueLabel` fallback is obvious.
        missingValueLabel: "SHOULD-NOT-APPEAR",
        options: [{ label: "", value: 1 }],
      },
    });
    await flushPromises();
    // A found option renders its own (empty) label verbatim — matches PlDropdown. It must
    // not borrow the missing-value text, which is reserved for values absent from options.
    expect(wrapper.find(".pl-chip").exists()).toBe(true);
    expect(wrapper.find(".pl-dropdown-multi__chip--missing").exists()).toBe(false);
    expect(wrapper.html()).not.toContain("SHOULD-NOT-APPEAR");
  });

  it("replaces missing chips with normal chips when options later contain the values", async () => {
    const wrapper = mount(PlDropdownMulti, {
      props: {
        modelValue: [1],
        options: [{ text: "Option 2", value: 2 }],
      },
    });
    await flushPromises();
    expect(wrapper.findAll(".pl-dropdown-multi__chip--missing").length).toBe(1);

    // Simulates the upstream block coming back: options now contain the value.
    await wrapper.setProps({
      options: [
        { text: "Option 1", value: 1 },
        { text: "Option 2", value: 2 },
      ],
    });
    await flushPromises();
    expect(wrapper.findAll(".pl-dropdown-multi__chip--missing").length).toBe(0);
    expect(wrapper.findAll(".pl-chip").length).toBe(1);
  });
});
