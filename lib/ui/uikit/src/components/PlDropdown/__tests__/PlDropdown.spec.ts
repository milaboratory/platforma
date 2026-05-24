import { describe, it, expect } from "vitest";

import { mount, flushPromises } from "@vue/test-utils";
import PlDropdown from "../PlDropdown.vue";

describe("PlDropdown", () => {
  it("modelValue", async () => {
    const wrapper = mount(PlDropdown, {
      props: {
        modelValue: 1,
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
        options: [
          { text: "Option 1", value: 1 },
          { text: "Option 2", value: 2 },
        ],
      },
    });

    await wrapper.find("input").trigger("focus");

    const options = [...document.body.querySelectorAll(".dropdown-list-item")] as HTMLElement[];

    expect(options.length).toBe(2);

    options[1].click();
    await flushPromises();

    expect(wrapper.props("modelValue")).toBe(2);

    expect(await wrapper.findAll(".dropdown-list-item").length).toBe(0); // options are closed after click
  });

  it("renders missingValueLabel when modelValue is not in options", async () => {
    const wrapper = mount(PlDropdown, {
      props: {
        modelValue: { __isRef: true as const, blockId: "deleted", name: "out" },
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
        options: [
          { text: "Option 1", value: 1 },
          { text: "Option 2", value: 2 },
        ],
      },
    });

    await flushPromises();

    const missing = wrapper.find(".input-value--missing");
    expect(missing.exists()).toBe(true);
    expect(missing.text()).toBe("Value not available");

    // Raw value (JSON-stringified object) must not leak into the DOM.
    expect(wrapper.html()).not.toContain('"blockId"');
    expect(wrapper.html()).not.toContain('"__isRef"');

    // Redundant generic error helper is suppressed.
    const error = wrapper.find(".pl-dropdown__error");
    expect(error.exists() ? error.text() : "").not.toContain(
      "The selected value is not one of the options",
    );
  });

  it("uses custom missingValueLabel when provided", async () => {
    const wrapper = mount(PlDropdown, {
      props: {
        modelValue: 99,
        missingValueLabel: "Gone, kaput",
        options: [{ text: "Option 1", value: 1 }],
      },
    });

    await flushPromises();
    expect(wrapper.find(".input-value--missing").text()).toBe("Gone, kaput");
  });

  it("does not render missingValueLabel while options are loading (options undefined)", async () => {
    const wrapper = mount(PlDropdown, {
      props: { modelValue: 99, options: undefined },
    });
    await flushPromises();
    expect(wrapper.find(".input-value--missing").exists()).toBe(false);
  });
});
