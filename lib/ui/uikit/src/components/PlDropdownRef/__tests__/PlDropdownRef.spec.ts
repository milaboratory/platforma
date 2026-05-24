import { describe, it, expect } from "vitest";

import { mount, flushPromises } from "@vue/test-utils";
import PlDropdownRef from "../PlDropdownRef.vue";

describe("PlDropdownRef", () => {
  it("modelValue", async () => {
    const wrapper = mount(PlDropdownRef, {
      props: {
        modelValue: {
          __isRef: true as const,
          blockId: "1",
          name: "Ref to block 1",
        },
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
        options: [
          {
            label: "Ref 1",
            ref: {
              __isRef: true as const,
              blockId: "1",
              name: "Ref to block 1",
            },
          },
          {
            label: "Ref 2",
            ref: {
              __isRef: true as const,
              blockId: "2",
              name: "Ref to block 2",
            },
          },
        ],
      },
    });

    await wrapper.find("input").trigger("focus");

    const options = [...document.body.querySelectorAll(".dropdown-list-item")] as HTMLElement[];

    expect(options.length).toBe(2);

    options[1].click();
    await flushPromises();

    expect(wrapper.props("modelValue")).toStrictEqual({
      __isRef: true as const,
      blockId: "2",
      name: "Ref to block 2",
    });

    expect(await wrapper.findAll(".dropdown-list-item").length).toBe(0); // options are closed after click
  });

  it("renders the ref-specific missingValueLabel default when ref is not in options", async () => {
    const wrapper = mount(PlDropdownRef, {
      props: {
        modelValue: {
          __isRef: true as const,
          blockId: "deleted-block",
          name: "Ref to deleted block",
        },
        options: [
          {
            label: "Ref 1",
            ref: {
              __isRef: true as const,
              blockId: "1",
              name: "Ref to block 1",
            },
          },
        ],
      },
    });

    await flushPromises();

    const missing = wrapper.find(".input-value--missing");
    expect(missing.exists()).toBe(true);
    expect(missing.text()).toBe("Upstream value removed");
  });
});
