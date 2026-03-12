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
});
