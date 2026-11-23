import {
  createColumnValueId,
  createGlobalPObjectId,
  type BlockColumnLinks,
  type ColumnLink,
} from "@platforma-sdk/model";
import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import { columnLinksMissingValue } from "./columnLinksMissingValue";

vi.mock("../../composition/useOpenBlock", () => ({ useOpenBlock: () => async () => {} }));

const PATH = createGlobalPObjectId("samples", "metadata.path");
const ty1 = createColumnValueId({ column: PATH, value: "Ty1" });

const OTHER = createGlobalPObjectId("mixcr", "abundance");

const links: Pick<BlockColumnLinks, "dependencies" | "labels"> = {
  dependencies: [
    {
      producer: { blockId: "samples", name: "metadata.path" },
      holderBlockId: "enrichment",
      ref: PATH,
      values: ["Ty1"],
      columnLabel: "Path",
      check: { type: "unavailable" },
    },
  ],
  labels: { samples: "Samples" },
};

describe("columnLinksMissingValue", () => {
  test("links the block that does not provide the column", () => {
    const missing = columnLinksMissingValue(() => links);
    const tooltip = missing.tooltip(ty1);
    if (tooltip === undefined) throw new Error("expected a tooltip");
    const wrapper = mount(tooltip);

    expect(missing.label(ty1)).toBe("Ty1 — not available");

    expect(wrapper.text()).toBe("Samples does not provide “Path”.");
    expect(wrapper.get("button").attributes("title")).toBe("Open Samples");
  });

  test("says a block that has not been run does not provide the column", () => {
    const tooltip = columnLinksMissingValue(() => ({
      ...links,
      dependencies: links.dependencies.map((link): ColumnLink => ({
        ...link,
        check: { type: "notRun" },
      })),
    })).tooltip(ty1);
    if (tooltip === undefined) throw new Error("expected a tooltip");

    expect(mount(tooltip).text()).toBe("Samples does not provide “Path”.");
  });

  test("says a provided column waits for the other inputs of the block", () => {
    const missing = columnLinksMissingValue(() => ({
      ...links,
      dependencies: [
        ...links.dependencies.map((link): ColumnLink => ({ ...link, check: { type: "ok" } })),
        ...links.dependencies.map((link): ColumnLink => ({
          ...link,
          ref: OTHER,
          check: { type: "notRun" },
        })),
      ],
    }));
    const tooltip = missing.tooltip(ty1);
    if (tooltip === undefined) throw new Error("expected a tooltip");

    expect(missing.label(ty1)).toBe("Ty1");
    expect(mount(tooltip).text()).toBe("Waiting for the other inputs of this block.");
  });

  test("tells nothing while the dependencies are not known", () => {
    const missing = columnLinksMissingValue(() => undefined);
    expect(missing.label(ty1)).toBeUndefined();
    expect(missing.tooltip(ty1)).toBeUndefined();
  });
});
