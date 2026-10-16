import type { BlockData } from "@milaboratories/milaboratories.test-block-model.model";
import { BlockModelHarness } from "@platforma-sdk/test";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

let model: BlockModelHarness<BlockData, BlockData>;

beforeAll(async () => {
  model = await BlockModelHarness.load<BlockData, BlockData>(
    () => import("@milaboratories/milaboratories.test-block-model.model"),
  );
});

afterAll(() => model.unload());

describe("BlockModelHarness", () => {
  test("a second load is refused while one is installed", async () => {
    await expect(
      BlockModelHarness.load(() => import("@milaboratories/milaboratories.test-block-model.model")),
    ).rejects.toThrow(/already installed/);
  });

  test("facade callbacks: initial data, args, template params", () => {
    const data = model.initialData();
    expect(data.titleArg).toBe("The title");
    expect(model.args(data).titleArg).toBe("The title");
    expect(model.templateParams(data)).toEqual({
      titleArg: "The title",
      subtitleArg: "The subtitle",
      badgeArg: "The badge",
      tagToWorkflow: "workflow-tag",
      tagArgs: [],
    });
  });

  test("results cross the JSON boundary the middle layer reads them through", () => {
    // `sections` builds `badge: ctx.args?.badgeArg`; with no badge the live object has the key
    // set to undefined, and the middle layer, reading it through JSON, has no key at all.
    const { badgeArg: _, ...args } = model.initialData();
    const [section] = model.render<object[]>("sections", { args: args as BlockData });
    expect("badge" in section).toBe(false);
  });

  test("params: absent params are {}, and the kind's check runs", () => {
    expect(model.dataFromParams({ titleArg: "From a template" }).titleArg).toBe("From a template");
    expect(model.dataFromParams(undefined).titleArg).toBe("The title");
    expect(model.validateParams(undefined)).toBeUndefined();
    expect(model.validateParams({ titleArg: 1 })).toMatch(/titleArg/);
  });

  test("render lambdas read data and args", () => {
    const args = { ...model.initialData(), titleArg: "Custom" };
    expect(model.render("title", { args })).toBe("Custom <- the title");
    expect(model.render("sections", { args })).toEqual([
      { type: "link", href: "/", label: "Main", badge: "The badge" },
    ]);
  });

  test("a plugin output reads its data from the block storage", () => {
    expect(model.render("plugin-output#counter#count", { storage: model.initialStorage() })).toBe(
      10,
    );
  });

  test("a lambda that needs a project throws naming what it needed", () => {
    expect(() => model.render("delayedOutput")).toThrow(/needs a rendered project/);
  });

  test("an unknown lambda lists the names render takes", () => {
    expect(() => model.render("nope")).toThrow(/known: .*delayedOutput.*sections/);
  });
});
