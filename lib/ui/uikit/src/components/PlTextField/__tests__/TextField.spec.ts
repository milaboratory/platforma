import { describe, it, expect } from "vitest";

import { mount } from "@vue/test-utils";
import PlTextField from "../PlTextField.vue";

// Vue Test Utils can't infer generic type parameters from mount() — props type collapses to `never`.
// Using `as any` for .props() calls as a workaround.
// https://github.com/vuejs/test-utils/issues/2436

describe("TextField", () => {
  it("renders properly", () => {
    const wrapper = mount(PlTextField, {
      props: {
        label: "TextField Label",
        modelValue: "",
      },
    });
    expect(wrapper.text()).toContain("TextField Label");
  });

  it("modelValue:string", async () => {
    const wrapper = mount(PlTextField, {
      props: {
        modelValue: "initialText",
        "onUpdate:modelValue": (e: string) => wrapper.setProps({ modelValue: e }),
      },
    });

    await wrapper.find("input").setValue("test");
    expect((wrapper as any).props("modelValue")).toBe("test");
  });

  it("modelValue:string?", async () => {
    const wrapper = mount(PlTextField, {
      props: {
        modelValue: "initialText" as string | undefined,
        clearable: true,
        "onUpdate:modelValue": (e: string | undefined) => wrapper.setProps({ modelValue: e }),
      },
    });

    await wrapper.find("input").setValue("test");
    expect((wrapper as any).props("modelValue")).toBe("test");
  });
});
