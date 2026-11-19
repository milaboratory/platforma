import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { Component } from "vue";

/**
 * Every component ships a default `data-testid` on its root, `pl-<component-kebab>`, so E2E tests
 * can find it without the consuming app configuring anything. A `data-testid` passed by the caller
 * replaces it.
 */

// Components without a root element to mark, or whose root needs data these generic props don't give.
const exempt: Record<string, string> = {
  PlAccordion: "renders only slots",
  PlErrorBoundary: "renders its slot plus an alert, no own root",
  PlProgressBar: "renders nothing unless loading",
  PlStatusTag: "renders nothing without a type",
  PlChartHistogram: "needs chart data to mount",
  PlChartStackedBar: "needs chart data to mount",
  PlChartStackedBarCompact: "needs chart data to mount",
  PlIcon16: "icon",
  PlIcon24: "icon",
  PlMaskIcon16: "icon",
  PlMaskIcon24: "icon",
  PlSvg: "icon",
};

const genericProps = {
  modelValue: true,
  options: [],
  items: [],
  label: "L",
  loading: true,
  type: "info",
};

const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

// vitest cannot compile PlSlideModal and PlProgressCell (imported types in defineProps), so they are
// left out of the glob; both mark their root in the template.
const modules = import.meta.glob<Record<string, unknown>>([
  "../components/Pl*/index.ts",
  "../layout/Pl*/index.ts",
  "!../components/PlSlideModal/index.ts",
  "!../components/PlProgressCell/index.ts",
]);

function isComponent(value: unknown): value is Component {
  return typeof value === "object" && value !== null && ("setup" in value || "render" in value);
}

async function collect(): Promise<[string, Component][]> {
  const found: [string, Component][] = [];
  for (const load of Object.values(modules)) {
    for (const [name, value] of Object.entries(await load())) {
      if (/^Pl[A-Z]/.test(name) && !(name in exempt) && isComponent(value))
        found.push([name, value]);
    }
  }
  return found.sort(([a], [b]) => a.localeCompare(b));
}

// jsdom has no CSS Houdini; PlPlaceholder registers a paint worklet when its module loads.
Object.defineProperty(globalThis, "CSS", {
  configurable: true,
  value: { paintWorklet: { addModule: () => {} }, supports: () => false, escape: (s: string) => s },
});

const components = await collect();

describe("default data-testid", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each(components)("%s marks its root", async (name, component) => {
    const wrapper = mount(component, { attachTo: document.body, props: genericProps });
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector(`[data-testid="${kebab(name)}"]`)).not.toBeNull();
    wrapper.unmount();
  });

  it.each(components)("%s lets the caller replace the root id", async (name, component) => {
    const wrapper = mount(component, {
      attachTo: document.body,
      props: genericProps,
      attrs: { "data-testid": "from-caller" },
    });
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('[data-testid="from-caller"]')).not.toBeNull();
    expect(document.body.querySelector(`[data-testid="${kebab(name)}"]`)).toBeNull();
    wrapper.unmount();
  });
});
