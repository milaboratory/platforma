import { describe, it, expect } from "vitest";

import { flushPromises, mount } from "@vue/test-utils";
import { createColumnValueId, createGlobalPObjectId } from "@platforma-sdk/model";
import type { MissingValueTooltip } from "../../../helpers/columnValue";
import PlValueLabel from "../PlValueLabel.vue";

const treated = createColumnValueId({
  column: createGlobalPObjectId("samples", "metadata.condition"),
  value: "treated",
});

const isMarkedMissing = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find("[data-testid='pl-value-label']").classes().length > 0;

describe("PlValueLabel", () => {
  it("shows the label of the value's option", () => {
    const wrapper = mount(PlValueLabel, {
      props: { value: treated, options: [{ label: "Treated", value: treated }] },
    });
    expect(wrapper.text()).toBe("Treated");
    expect(isMarkedMissing(wrapper)).toBe(false);
  });

  it("shows the value a column value id picks while options are not loaded", () => {
    const wrapper = mount(PlValueLabel, { props: { value: treated } });
    expect(wrapper.text()).toBe("treated");
    expect(isMarkedMissing(wrapper)).toBe(false);
  });

  it("marks a value the options lack as not available", () => {
    const wrapper = mount(PlValueLabel, { props: { value: treated, options: [] } });
    expect(wrapper.text()).toBe("treated — not available");
    expect(isMarkedMissing(wrapper)).toBe(true);
  });

  it("keeps the caller's missingValueLabel", () => {
    const wrapper = mount(PlValueLabel, {
      props: { value: treated, options: [], missingValueLabel: "Gone" },
    });
    expect(wrapper.text()).toBe("Gone");
  });

  it("explains a missing value by the hint of the app in a tooltip", async () => {
    const hint: MissingValueTooltip = () => () => "Samples does not provide it";
    const wrapper = mount(PlValueLabel, {
      props: { value: treated, options: [], missingValueTooltip: hint },
      attachTo: document.body,
    });
    expect(wrapper.text()).toBe("treated — not available");
    expect(isMarkedMissing(wrapper)).toBe(true);

    await wrapper.find("[data-testid='pl-value-label']").trigger("mouseover");
    await new Promise((resolve) => setTimeout(resolve, 200));
    await flushPromises();
    expect(document.body.textContent).toContain("Samples does not provide it");
    wrapper.unmount();
  });

  it("shows a plain value as is", () => {
    const wrapper = mount(PlValueLabel, { props: { value: "R1" } });
    expect(wrapper.text()).toBe("R1");
  });
});
