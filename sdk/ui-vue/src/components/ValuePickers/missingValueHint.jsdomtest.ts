import {
  createColumnValueId,
  createGlobalPObjectId,
  type BlockDependencies,
  type DependencyEntry,
} from "@platforma-sdk/model";
import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import { missingValueHint } from "./missingValueHint";

vi.mock("../../composition/useOpenBlock", () => ({ useOpenBlock: () => async () => {} }));

const PATH = createGlobalPObjectId("samples", "metadata.path");
const ty1 = createColumnValueId({ column: PATH, value: "Ty1" });

const OTHER = createGlobalPObjectId("mixcr", "abundance");

const dependencies: BlockDependencies = {
  argsSource: "current",
  items: [
    {
      producerBlockId: "samples",
      output: "metadata.path",
      ref: PATH,
      values: ["Ty1"],
      columnLabel: "Path",
      status: { type: "broken", reason: "unavailable" },
    },
  ],
  labels: { samples: "Samples" },
};

describe("missingValueHint", () => {
  test("links the block that does not provide the column", () => {
    const hint = missingValueHint(() => dependencies)(ty1);
    if (hint === undefined) throw new Error("expected a hint");
    const wrapper = mount(hint);

    expect(wrapper.text()).toBe("Samples does not provide “Path”.");
    expect(wrapper.get("button").attributes("title")).toBe("Open Samples");
  });

  test("says a block that has not been run does not provide the column", () => {
    const hint = missingValueHint(() => ({
      ...dependencies,
      items: dependencies.items.map(
        (item): DependencyEntry => ({ ...item, status: { type: "notRun" } }),
      ),
    }))(ty1);
    if (hint === undefined) throw new Error("expected a hint");

    expect(mount(hint).text()).toBe("Samples does not provide “Path”.");
  });

  test("says a provided column waits for the other inputs of the block", () => {
    const hint = missingValueHint(() => ({
      ...dependencies,
      items: [
        ...dependencies.items.map((item): DependencyEntry => ({ ...item, status: { type: "ok" } })),
        ...dependencies.items.map(
          (item): DependencyEntry => ({ ...item, ref: OTHER, status: { type: "notRun" } }),
        ),
      ],
    }))(ty1);
    if (hint === undefined) throw new Error("expected a hint");

    expect(mount(hint).text()).toBe("Waiting for the other inputs of this block.");
  });

  test("gives no hint while the dependencies are not known", () => {
    expect(missingValueHint(() => undefined)(ty1)).toBeUndefined();
  });
});
