import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import PlBlockName from "./PlBlockName.vue";

const host: { openBlock: undefined | ((blockId: string) => Promise<void>) } = vi.hoisted(() => ({
  openBlock: undefined,
}));

vi.mock("../../composition/useOpenBlock", () => ({ useOpenBlock: () => host.openBlock }));

afterEach(() => {
  host.openBlock = undefined;
});

describe("PlBlockName", () => {
  test("is plain text when the app cannot open blocks", () => {
    const wrapper = mount(PlBlockName, { props: { blockId: "b1", name: "Samples" } });

    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.text()).toBe("Samples");
  });

  test("opens the block on click, telling the parent first", async () => {
    const calls: string[] = [];
    host.openBlock = vi.fn(async (blockId: string) => {
      calls.push(`open ${blockId}`);
    });
    const wrapper = mount(PlBlockName, {
      props: {
        blockId: "b1",
        name: "Samples",
        onOpen: (blockId: string) => calls.push(`onOpen ${blockId}`),
      },
    });

    const button = wrapper.get("button");
    expect(button.attributes("type")).toBe("button");
    expect(button.attributes("title")).toBe("Open Samples");
    expect(button.text()).toBe("Samples");

    await button.trigger("click");
    await flushPromises();

    expect(calls).toEqual(["onOpen b1", "open b1"]);
  });

  test("a block the app fails to open is logged", async () => {
    host.openBlock = vi.fn(async () => {
      throw new Error("no such block");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapper = mount(PlBlockName, { props: { blockId: "b1", name: "Samples" } });

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
