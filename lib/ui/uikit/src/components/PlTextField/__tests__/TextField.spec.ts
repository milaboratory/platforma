import { describe, it, expect } from "vitest";

import { mount } from "@vue/test-utils";
import PlTextField from "../PlTextField.vue";

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
    expect(wrapper.props("modelValue")).toBe("test");
  });

  it("modelValue:string?", async () => {
    const wrapper = mount(PlTextField, {
      props: {
        modelValue: "initialText" as string | undefined,
        clearable: true,
        "onUpdate:modelValue": (e) => wrapper.setProps({ modelValue: e }),
      },
    });

    await wrapper.find("input").setValue("test");
    expect(wrapper.props("modelValue")).toBe("test");
  });
});
