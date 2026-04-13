import PlNumberField from "../PlNumberField.vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

describe("PlNumberField.vue", () => {
  it("renders correctly with default props", () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
      },
    });
    expect(wrapper.find("input").element.value).toBe("10");
  });

  it("displays the label when provided", () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
        label: "Test Label",
      },
    });
    expect(wrapper.find("label").text()).toBe("Test Label");
  });

  it("increments the value when increment button is clicked", async () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
        step: 2,
      },
    });
    const incrementButton = wrapper.find(".pl-number-field__icons div:first-child");
    await incrementButton.trigger("click");
    expect(wrapper.vm.modelValue).toEqual(12);
  });

  it("decrements the value when decrement button is clicked", async () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
        step: 1,
      },
    });
    const decrementButton = wrapper.find(".pl-number-field__icons div:last-child");
    await decrementButton.trigger("click");
    expect(wrapper.vm.modelValue).toEqual(9);
  });

  it("disables increment button when value exceeds maxValue", () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
        maxValue: 10,
      },
    });
    const incrementButton = wrapper.find(".pl-number-field__icons div:first-child");
    expect(incrementButton.classes()).toContain("disabled");
  });

  it("disables decrement button when value is below minValue", () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 1,
        minValue: 1,
      },
    });
    const decrementButton = wrapper.find(".pl-number-field__icons div:last-child");
    expect(decrementButton.classes()).toContain("disabled");
  });

  it("renders external errorMessage with priority", () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 5,
        minValue: 10,
        errorMessage: "Custom error message",
      },
    });
    const errorText = wrapper.find(".pl-number-field__error").text();
    expect(errorText).toBe("Custom error message");
  });

  it("renders validation error when no external errorMessage", () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 5,
        minValue: 10,
      },
    });
    const errorText = wrapper.find(".pl-number-field__error").text();
    expect(errorText).toBe("Value must be higher than 10");
  });

  it("disables step buttons when input has an error", async () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
      },
    });
    const input = wrapper.find("input");
    await input.setValue("abc");

    const incrementButton = wrapper.find(".pl-number-field__icons div:first-child");
    const decrementButton = wrapper.find(".pl-number-field__icons div:last-child");
    expect(incrementButton.classes()).toContain("disabled");
    expect(decrementButton.classes()).toContain("disabled");
  });

  describe("typing and value updates", () => {
    it("updates model for valid input", async () => {
      const wrapper = mount(PlNumberField, {
        props: { modelValue: 5 },
      });
      const input = wrapper.find("input");

      await input.setValue("15");
      expect(wrapper.vm.modelValue).toEqual(15);
    });

    it("does not change model for invalid input", async () => {
      const wrapper = mount(PlNumberField, {
        props: { modelValue: 15 },
      });
      const input = wrapper.find("input");

      await input.setValue("abc");
      expect(wrapper.vm.modelValue).toEqual(15);
    });

    it("clears to undefined for partial input (-) on blur", async () => {
      const wrapper = mount(PlNumberField, {
        props: { modelValue: 15 },
      });
      const input = wrapper.find("input");

      await input.setValue("-");
      await input.trigger("focusout");
      expect(wrapper.vm.modelValue).toEqual(undefined);
      expect(input.element.value).toBe("");
    });

    it("clears to undefined for partial input (.) on blur", async () => {
      const wrapper = mount(PlNumberField, {
        props: { modelValue: 15 },
      });
      const input = wrapper.find("input");

      await input.setValue(".");
      await input.trigger("focusout");
      expect(wrapper.vm.modelValue).toEqual(undefined);
      expect(input.element.value).toBe("");
    });

    it("accepts negative numbers", async () => {
      const wrapper = mount(PlNumberField, {
        props: { modelValue: 5 },
      });
      const input = wrapper.find("input");

      await input.setValue("-1");
      await input.trigger("focusout");
      expect(wrapper.vm.modelValue).toEqual(-1);
      expect(input.element.value).toBe("-1");
    });

    it("shows separator error for comma-formatted input", async () => {
      const wrapper = mount(PlNumberField, {
        props: { modelValue: 5 },
      });
      const input = wrapper.find("input");

      await input.setValue("1,5");
      expect(wrapper.vm.modelValue).toEqual(5); // unchanged
      expect(wrapper.find(".pl-number-field__error").text()).toContain("separator");
    });
  });

  describe("blur/enter formatting", () => {
    it("formats trailing dot on blur: '123.' → '123'", async () => {
      const wrapper = mount(PlNumberField, {
        props: { modelValue: 0 },
      });
      const input = wrapper.find("input");

      await input.setValue("123.");
      expect(wrapper.vm.modelValue).toEqual(123);

      await input.trigger("focusout");
      expect(input.element.value).toBe("123");
    });

    it("formats leading dot on blur: '.5' → '0.5'", async () => {
      const wrapper = mount(PlNumberField, {
        props: { modelValue: 0 },
      });
      const input = wrapper.find("input");

      await input.setValue(".5");
      expect(wrapper.vm.modelValue).toEqual(0.5);

      await input.trigger("focusout");
      expect(input.element.value).toBe("0.5");
    });

    it("formats leading zero on blur: '01' → '1'", async () => {
      const wrapper = mount(PlNumberField, {
        props: { modelValue: 0 },
      });
      const input = wrapper.find("input");

      await input.setValue("01");
      expect(wrapper.vm.modelValue).toEqual(1);

      await input.trigger("focusout");
      expect(input.element.value).toBe("1");
    });

    it("formats trailing zeros on blur: '1.10' → '1.1'", async () => {
      const wrapper = mount(PlNumberField, {
        props: { modelValue: 0 },
      });
      const input = wrapper.find("input");

      await input.setValue("1.10");
      expect(wrapper.vm.modelValue).toEqual(1.1);

      await input.trigger("focusout");
      expect(input.element.value).toBe("1.1");
    });

    it("formats exponential on blur: '1e-5' → '0.00001'", async () => {
      const wrapper = mount(PlNumberField, {
        props: { modelValue: 0 },
      });
      const input = wrapper.find("input");

      await input.setValue("1e-5");
      expect(wrapper.vm.modelValue).toEqual(0.00001);

      await input.trigger("focusout");
      expect(input.element.value).toBe("0.00001");
    });

    it("formats partial exponential on blur: '1e' → '1'", async () => {
      const wrapper = mount(PlNumberField, {
        props: { modelValue: 0 },
      });
      const input = wrapper.find("input");

      await input.setValue("1e");
      expect(wrapper.vm.modelValue).toEqual(1);

      await input.trigger("focusout");
      expect(input.element.value).toBe("1");
    });
  });

  it("update model with undefined when input is cleared", async () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
      },
    });
    const input = wrapper.find("input");
    await input.setValue("");
    await input.trigger("focusout");
    expect(wrapper.vm.modelValue).toEqual(undefined);
  });

  it("external modelValue change", async () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
      },
    });

    const input = wrapper.find("input");
    await input.trigger("focusout");
    expect(wrapper.vm.modelValue).toEqual(10);
    expect(input.element.value).toEqual("10");

    await input.setValue("");
    await input.trigger("focusout");
    expect(wrapper.vm.modelValue).toEqual(undefined);

    wrapper.setProps({ modelValue: 1 });

    await input.trigger("focusout");
    expect(wrapper.vm.modelValue).toEqual(1);
    expect(input.element.value).toEqual("1");

    await input.setValue("10");
    expect(wrapper.vm.modelValue).toEqual(10);
    expect(input.element.value).toEqual("10");
  });
});
