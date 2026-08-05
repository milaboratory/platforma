// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PlTextField from "../components/PlTextField/PlTextField.vue";
import PlNumberField from "../components/PlNumberField/PlNumberField.vue";

/**
 * A valueless attribute (`<PlTextField required />`) passes the empty string, and Vue coerces that
 * to `true` only for props whose runtime type includes Boolean. A prop declared as a bare type
 * parameter or as a conditional type compiles to one with no runtime type, which silently keeps
 * the `""` and reads as false everywhere it is used.
 *
 * Passed through `attrs`, because that is what a valueless attribute in a template produces, and
 * because the empty string is deliberately not a valid value for either prop.
 */
describe.each([
  ["PlTextField", PlTextField, ""],
  ["PlNumberField", PlNumberField, undefined],
])("%s coerces valueless attributes", (_name, Component, emptyValue) => {
  it("treats a valueless `required` as true", () => {
    const w = mount(Component, {
      props: { modelValue: emptyValue, label: "L" },
      attrs: { required: "" },
    });
    expect(w.props("required")).toBe(true);
    expect(w.text()).toContain("Value is required");
  });

  it("treats a valueless `clearable` as true", () => {
    const w = mount(Component, {
      props: { modelValue: emptyValue, label: "L" },
      attrs: { clearable: "" },
    });
    expect(w.props("clearable")).toBe(true);
  });

  it("leaves both falsy when the attribute is absent", () => {
    const w = mount(Component, { props: { modelValue: emptyValue, label: "L" } });
    expect(w.props("required")).toBeFalsy();
    expect(w.props("clearable")).toBeFalsy();
    expect(w.text()).not.toContain("Value is required");
  });
});
