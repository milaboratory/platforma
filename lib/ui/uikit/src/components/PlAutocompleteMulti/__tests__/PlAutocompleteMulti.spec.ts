import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { mount, flushPromises } from "@vue/test-utils";
import PlAutocompleteMulti from "../PlAutocompleteMulti.vue";

describe("PlAutocompleteMulti", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("modelValue", async () => {
    const wrapper = mount(PlAutocompleteMulti, {
      props: {
        modelValue: [1],
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
        debounce: 0,
        optionsSearch: async () => {
          return [
            { label: "Option 1", value: 1 },
            { label: "Option 2", value: 2 },
          ];
        },
      },
    });

    // Flush initial watch (immediate: true) that fires on mount
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();

    await wrapper.find(".pl-autocomplete-multi__envelope").trigger("click");
    await wrapper.find("input").trigger("focus");
    // Flush debounce (0ms) + optionsSearch promise
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();

    const getOptions = () =>
      [...document.body.querySelectorAll(".dropdown-list-item")] as HTMLElement[];

    expect(getOptions().length).toBe(2);

    getOptions()[1].click();
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();

    expect(wrapper.props("modelValue")).toEqual([1, 2]);

    expect(getOptions().length).toBe(2); // options are not closed after click
  });
});
