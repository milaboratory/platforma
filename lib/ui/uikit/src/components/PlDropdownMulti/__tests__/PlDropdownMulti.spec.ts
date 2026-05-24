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
});
