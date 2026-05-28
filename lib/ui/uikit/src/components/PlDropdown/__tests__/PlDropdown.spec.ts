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

    // The redundant generic error helper no longer appears.
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

  it("renders missingValueLabel alongside .disabled root when disabled with missing value", async () => {
    const wrapper = mount(PlDropdown, {
      props: {
        modelValue: 99,
        disabled: true,
        options: [{ text: "Option 1", value: 1 }],
      },
    });
    await flushPromises();
    // The SCSS disabled override (`color: var(--dis-01)`) needs both `.disabled`
    // on the root and `.input-value--missing` on the label. jsdom doesn't resolve
    // CSS specificity, so we only assert the hooks exist — not the computed color.
    expect(wrapper.find(".pl-dropdown.disabled").exists()).toBe(true);
    expect(wrapper.find(".input-value--missing").exists()).toBe(true);
  });

  it("shows placeholder (not blank) when modelValue is null", async () => {
    const wrapper = mount(PlDropdown, {
      props: {
        modelValue: null,
        placeholder: "Pick one",
        options: [{ text: "Option 1", value: 1 }],
      },
    });
    await flushPromises();
    // null means "no value selected" — must render the placeholder, not blank.
    expect(wrapper.find("input").attributes("placeholder")).toBe("Pick one");
    // Must not trigger the missing-value branch.
    expect(wrapper.find(".input-value--missing").exists()).toBe(false);
  });

  it("clears the missing-state label when options later contain the value", async () => {
    const wrapper = mount(PlDropdown, {
      props: {
        modelValue: 1,
        options: [{ text: "Option 2", value: 2 }],
      },
    });
    await flushPromises();
    expect(wrapper.find(".input-value--missing").exists()).toBe(true);

    // Simulates the upstream block coming back: options now contain the value.
    await wrapper.setProps({
      options: [
        { text: "Option 1", value: 1 },
        { text: "Option 2", value: 2 },
      ],
    });
    await flushPromises();
    expect(wrapper.find(".input-value--missing").exists()).toBe(false);
  });

  it("renders the clear button when clearable + missing, and clears the model on click", async () => {
    const wrapper = mount(PlDropdown, {
      props: {
        modelValue: 99,
        clearable: true,
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
        options: [{ text: "Option 1", value: 1 }],
      },
    });
    await flushPromises();
    const clearBtn = wrapper.find(".clear");
    expect(clearBtn.exists()).toBe(true);
    await clearBtn.trigger("click");
    await flushPromises();
    expect(wrapper.props("modelValue")).toBeUndefined();
  });
});
