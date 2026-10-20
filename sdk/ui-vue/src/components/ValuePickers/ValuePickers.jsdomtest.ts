import { createColumnValueId, createGlobalPObjectId } from "@platforma-sdk/model";
import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";

// uikit reads the theme from localStorage on import, which this jsdom setup lacks.
vi.hoisted(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
});

vi.mock("../../defineApp", () => ({
  pluginDataKey: Symbol("plugin-data-access"),
  useSdkPlugin: () => undefined,
}));

const { PlValueLabel } = await import("./index");

const ty1 = createColumnValueId({
  column: createGlobalPObjectId("samples", "metadata.path"),
  value: "Ty1",
});

describe("value pickers", () => {
  test("show a missing value without a hint outside a block", () => {
    const wrapper = mount(PlValueLabel, { props: { value: ty1, options: [] } });
    expect(wrapper.text()).toBe("Ty1 — not available");
    expect(wrapper.find("[data-testid='pl-tooltip']").exists()).toBe(false);
  });

  test("keep the hint the caller gives", () => {
    const wrapper = mount(PlValueLabel, {
      props: { value: ty1, options: [], missingValueHint: () => () => "Gone" },
    });
    expect(wrapper.find("[data-testid='pl-tooltip']").exists()).toBe(true);
  });
});
