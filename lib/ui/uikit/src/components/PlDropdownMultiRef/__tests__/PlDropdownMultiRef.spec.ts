import { describe, it, expect } from "vitest";

import { mount, flushPromises } from "@vue/test-utils";
import PlDropdownMultiRef from "../PlDropdownMultiRef.vue";

describe("PlDropdownMultiRef", () => {
  it("modelValue", async () => {
    const wrapper = mount(PlDropdownMultiRef, {
      props: {
        modelValue: [
          {
            __isRef: true as const,
            blockId: "2",
            name: "Block 2 Ref",
          },
        ],
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
        options: [
          {
            label: "Block 1 label Ref",
            ref: {
              __isRef: true as const,
              blockId: "1",
              name: "Block 1 Ref",
            },
          },
          {
            label: "Block 2 label Ref",
            ref: {
              __isRef: true as const,
              blockId: "2",
              name: "Block 2 Ref",
            },
          },
        ],
      },
    });

    await wrapper.find("input").trigger("focus");

    const getOptions = () =>
      [...document.body.querySelectorAll(".dropdown-list-item")] as HTMLElement[];

    const options = getOptions();

    expect(options.length).toBe(2);

    options[0].click();
    await flushPromises();

    expect(wrapper.props("modelValue")).toEqual([
      {
        __isRef: true,
        blockId: "2",
        name: "Block 2 Ref",
      },
      {
        __isRef: true,
        blockId: "1",
        name: "Block 1 Ref",
      },
    ]);

    expect(getOptions().length).toBe(2); // options are not closed after click
  });
});
