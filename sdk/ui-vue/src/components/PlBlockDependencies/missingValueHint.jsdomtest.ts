import {
  createColumnValueId,
  createGlobalPObjectId,
  type BlockDependenciesOutput,
} from "@platforma-sdk/model";
import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import { missingValueHint } from "./missingValueHint";

vi.mock("../../defineApp", () => ({
  pluginDataKey: Symbol("plugin-data-access"),
  useSdkPlugin: () => undefined,
}));
vi.mock("../../composition/useOpenBlock", () => ({ useOpenBlock: () => async () => {} }));

const PATH = createGlobalPObjectId("samples", "metadata.path");
const ty1 = createColumnValueId({ column: PATH, value: "Ty1" });

const dependencies: BlockDependenciesOutput = {
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

  test("gives no hint while the dependencies are not known", () => {
    expect(missingValueHint(() => undefined)(ty1)).toBeUndefined();
  });
});
