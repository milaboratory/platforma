/**
 * The component recreates the whole AG Grid (`:key="reloadKey"`) when the stored
 * grid state disagrees with the grid's own state, which is meant to converge
 * after a single remount.
 *
 * It did not converge when the stored state travelled back through the platform:
 * the write is debounced, and a block that is running has its ui state re-pushed
 * meanwhile, so the state flipped between what the grid had and what the project
 * still held. Every flip re-armed the comparison and the grid was recreated ~20
 * times a second — the symptom being a strobing header and a console full of AG
 * Grid licence banners.
 */
import { mount } from "@vue/test-utils";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { defineComponent, h, onUnmounted, ref } from "vue";

const hoisted = vi.hoisted(() => ({ driver: {} as Record<string, unknown> }));

// The CSV exporter reaches the pf-spec WASM module, which cannot initialise
// under jsdom; nothing here exercises export.
vi.mock("@milaboratories/pf-spec-driver", () => ({ SpecDriver: class {} }));
vi.mock("@milaboratories/columns-collection-driver", () => ({
  ColumnsCollectionDriverImpl: class {},
}));
vi.mock("@platforma-sdk/model", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getRawPlatformaInstance: () => ({ pFrameDriver: hoisted.driver }) };
});

const { activateAgGrid } = await import("../../../composition/AgGrid");
const { canonicalizeJson } = await import("@platforma-sdk/model");
const PlAgDataTableV2 = (await import("../PlAgDataTableV2.vue")).default;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

const axisSpec = { name: "sampleId", type: "String", annotations: { "pl7.app/label": "Sample" } };
const colSpec = (name: string): Any => ({
  kind: "PColumn",
  name,
  valueType: "Int",
  axesSpec: [axisSpec],
  annotations: { "pl7.app/label": name },
});
const specs: Any[] = [
  { type: "axis", id: { name: "sampleId", type: "String" }, spec: axisSpec },
  { type: "column", id: "col-a", spec: colSpec("A") },
  { type: "column", id: "col-b", spec: colSpec("B") },
];
const columnId = (spec: Any) =>
  canonicalizeJson({ type: "column", id: spec.id } as never) as string;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Counts AG Grid instantiations: every `createGrid` inserts one root wrapper. */
function countGrids() {
  let created = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes)
        if (node instanceof Element && node.classList?.contains("ag-root-wrapper")) created++;
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return { get: () => created, stop: () => observer.disconnect() };
}

/**
 * Stands in for the block app plus the platform: a write from the table does not
 * land in the prop straight away (it is debounced, then travels to the project
 * state and back), and while a block runs the platform keeps re-pushing the
 * state it currently holds.
 */
const Host = defineComponent({
  props: {
    settings: { type: Object, required: true },
    initial: { type: Object, required: true },
    echoMs: { type: Number, required: true },
    pushEveryMs: { type: Number, required: true },
  },
  setup(props) {
    const clone = (value: Any) => JSON.parse(JSON.stringify(value)) as Any;
    const platform = { value: clone(props.initial) };
    const pushed = ref(clone(platform.value));
    const timer = setInterval(() => (pushed.value = clone(platform.value)), props.pushEveryMs);
    onUnmounted(() => clearInterval(timer));
    return () =>
      h(PlAgDataTableV2 as Any, {
        modelValue: pushed.value,
        "onUpdate:modelValue": (state: Any) => {
          const snapshot = clone(state);
          setTimeout(() => {
            platform.value = snapshot;
            pushed.value = clone(snapshot);
          }, props.echoMs);
        },
        settings: props.settings,
      });
  },
});

beforeAll(() => activateAgGrid());

describe("PlAgDataTableV2", () => {
  it("takes the loading overlay down when the model goes between handles", async () => {
    // What a block re-running does to the table: it is already loading against one
    // set of handles when the model drops them for a moment on its way to the next.
    // That settings change starts no calculation of its own, so the one in flight is
    // the only thing left that can clear the overlay.
    hoisted.driver.getSpec = async () => {
      await wait(150);
      return specs;
    };
    hoisted.driver.getShape = async () => ({ rows: 0, columns: specs.length });
    hoisted.driver.getData = async () => [];

    const sourceId = "src-1";
    const withHandles = (n: number) => ({
      sourceId,
      sheets: [],
      model: {
        sourceId,
        fullTableHandle: `full-${n}`,
        visibleTableHandle: `visible-${n}`,
        fullPframeHandle: `pf-${n}`,
      },
    });
    const betweenHandles = { sourceId, sheets: [], model: { sourceId } };

    const wrapper = mount(Host, {
      attachTo: document.body,
      props: {
        settings: withHandles(1),
        initial: {
          version: 8,
          stateCache: [],
          pTableParams: {
            sourceId,
            hiddenColIds: null,
            sorting: null,
            filters: null,
            defaultFilters: null,
          },
        },
        echoMs: 0,
        pushEveryMs: 1000,
      },
    });

    await wait(50); // the first calculation is in flight
    await wrapper.setProps({ settings: betweenHandles });
    await wait(900);

    const overlay = (document.body.textContent || "").includes("Loading data...");
    wrapper.unmount();
    document.body.innerHTML = "";
    expect(overlay).toBe(false);
  });

  it("stops recreating the grid once the stored state has been applied", async () => {
    hoisted.driver.getSpec = async () => {
      await wait(40);
      return specs;
    };
    hoisted.driver.getShape = async () => ({ rows: 0, columns: specs.length });
    hoisted.driver.getData = async () => [];

    const sourceId = "src-1";
    const counter = countGrids();
    const wrapper = mount(Host, {
      attachTo: document.body,
      props: {
        // A block that has just been rebuilt: still running, model not there yet.
        settings: { sourceId, sheets: [], model: undefined },
        initial: {
          version: 8,
          stateCache: [
            {
              sourceId,
              // A sort the user left behind in a previous session.
              gridState: { sort: { sortModel: [{ colId: columnId(specs[1]), sort: "asc" }] } },
              sheetsState: [],
              filtersState: null,
              defaultFiltersState: null,
            },
          ],
          pTableParams: {
            sourceId,
            hiddenColIds: null,
            sorting: null,
            filters: null,
            defaultFilters: null,
          },
        },
        echoMs: 400,
        pushEveryMs: 50,
      },
    });

    await wait(20);
    await wrapper.setProps({
      settings: {
        sourceId,
        sheets: [],
        model: {
          sourceId,
          fullTableHandle: "full-1",
          visibleTableHandle: "visible-1",
          fullPframeHandle: "pf-1",
        },
      },
    });
    await wait(1200);

    const created = counter.get();
    counter.stop();
    wrapper.unmount();
    document.body.innerHTML = "";

    // One grid for the mount, at most one more to apply the stored sort.
    expect(created).toBeLessThanOrEqual(2);
  });
});
