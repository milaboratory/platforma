/**
 * The column manager and the export button are shown only while the table holds
 * the api of the grid on screen. A replaced grid can be destroyed after its
 * successor is ready, and that late destroy must leave the successor's api in place.
 */
import { mount } from "@vue/test-utils";
import type { GridApi, GridPreDestroyedEvent } from "ag-grid-enterprise";
import { createGrid } from "ag-grid-enterprise";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { PlAgDataTableV2Row } from "../types";

// The CSV exporter reaches the pf-spec WASM module, which cannot initialise
// under jsdom; nothing here exercises export.
vi.mock("@milaboratories/pf-spec-driver", () => ({ SpecDriver: class {} }));
vi.mock("@milaboratories/columns-collection-driver", () => ({
  ColumnsCollectionDriverImpl: class {},
}));

const { activateAgGrid } = await import("../../../composition/AgGrid");
const { createPlDataTableStateV2 } = await import("@platforma-sdk/model");
const PlAgDataTableV2 = (await import("../PlAgDataTableV2.vue")).default;
const { PlAgGridColumnManager } = await import("../../PlAgGridColumnManager");

beforeAll(() => activateAgGrid());

describe("PlAgDataTableV2 grid api", () => {
  it("keeps the api of the grid on screen when a replaced grid is destroyed", async () => {
    const wrapper = mount(PlAgDataTableV2, {
      attachTo: document.body,
      props: {
        modelValue: createPlDataTableStateV2(),
        "onUpdate:modelValue": () => {},
        settings: { sourceId: null, pending: false, error: null },
      },
    });
    await vi.waitFor(() =>
      expect(wrapper.findComponent(PlAgGridColumnManager).exists()).toBe(true),
    );
    const shown: GridApi<PlAgDataTableV2Row> = wrapper
      .findComponent(PlAgGridColumnManager)
      .props("api");
    const onGridPreDestroyed = shown.getGridOption("onGridPreDestroyed");
    const replaced = createGrid<PlAgDataTableV2Row>(document.createElement("div"), {});

    onGridPreDestroyed?.(preDestroyed(replaced));
    await nextTick();
    const kept = wrapper.findComponent(PlAgGridColumnManager);
    expect(kept.exists()).toBe(true);
    expect(kept.props("api").getGridId()).toBe(shown.getGridId());

    onGridPreDestroyed?.(preDestroyed(shown));
    await nextTick();
    expect(wrapper.findComponent(PlAgGridColumnManager).exists()).toBe(false);

    replaced.destroy();
    wrapper.unmount();
    document.body.innerHTML = "";
  });
});

// Internals

function preDestroyed(api: GridApi<PlAgDataTableV2Row>): GridPreDestroyedEvent<PlAgDataTableV2Row> {
  return { type: "gridPreDestroyed", api, context: undefined, state: api.getState() };
}
