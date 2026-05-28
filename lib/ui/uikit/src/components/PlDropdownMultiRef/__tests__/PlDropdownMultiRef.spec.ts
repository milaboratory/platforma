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

  it("renders the ref-specific missingValueLabel default for a stale ref", async () => {
    const wrapper = mount(PlDropdownMultiRef, {
      props: {
        modelValue: [
          { __isRef: true as const, blockId: "1", name: "Ref to block 1" },
          { __isRef: true as const, blockId: "deleted", name: "Ref to deleted block" },
        ],
        options: [
          {
            label: "Ref 1",
            ref: { __isRef: true as const, blockId: "1", name: "Ref to block 1" },
          },
        ],
      },
    });

    await flushPromises();

    const missing = wrapper.findAll(".pl-dropdown-multi__chip--missing");
    expect(missing.length).toBe(1);
    expect(missing[0].text()).toContain("Upstream value removed");
  });

  it("forwards a caller-supplied missingValueLabel that overrides the Ref default", async () => {
    const wrapper = mount(PlDropdownMultiRef, {
      props: {
        modelValue: [{ __isRef: true as const, blockId: "deleted", name: "Ref to deleted block" }],
        missingValueLabel: "Caller override",
        options: [
          {
            label: "Ref 1",
            ref: { __isRef: true as const, blockId: "1", name: "Ref to block 1" },
          },
        ],
      },
    });
    await flushPromises();
    const missing = wrapper.findAll(".pl-dropdown-multi__chip--missing");
    expect(missing.length).toBe(1);
    expect(missing[0].text()).toContain("Caller override");
  });
});
