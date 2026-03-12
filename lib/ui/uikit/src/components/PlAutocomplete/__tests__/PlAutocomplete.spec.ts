import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { mount, flushPromises } from "@vue/test-utils";
import PlAutocomplete from "../PlAutocomplete.vue";

describe("PlAutocomplete", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("modelValue", async () => {
    const options = [
      { text: "Option 1", value: 1 },
      { text: "Option 2", value: 2 },
    ];
    const wrapper = mount(PlAutocomplete, {
      props: {
        modelValue: 1,
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
        optionsSearch: (_str: string) => {
          return Promise.resolve(options);
        },
      },
    });

    // Flush initial watch (immediate: true) that fires on mount
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();

    await wrapper.find(".pl-autocomplete__envelope").trigger("click");
    await wrapper.find("input").trigger("focus");
    await wrapper.find("input").setValue("option");
    // Flush 300ms debounce + optionsSearch promise
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    const getOptions = () =>
      [...document.body.querySelectorAll(".dropdown-list-item")] as HTMLElement[];

    expect(getOptions().length).toBe(2);

    getOptions()[1].click();
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();

    expect(wrapper.props("modelValue")).toBe(2);

    expect(await wrapper.findAll(".dropdown-list-item").length).toBe(0); // options are closed after click
  });
});
