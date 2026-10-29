/* AC3.1 (exec fallbacks): an exec without .fallbacks() renders exec.exec with exactly the inputs
 * it had before the feature, so its CID, and deduplication against earlier runs, is unchanged.
 *
 * The full dump was compared with the SDK before exec fallbacks when this test was written (same
 * template, both SDKs, identical text). Kept here are the parts that do not depend on the test
 * software's version: the input names and the absence of any fallback input. */
import { tplTest } from "@platforma-sdk/test";

tplTest.concurrent(
  "AC3.1 exec without fallbacks: the exec.exec inputs are unchanged",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.cid_inputs",
      ["dump", "keys"],
      () => ({}),
    );

    const keys = await result
      .computeOutput("keys", (a) => a?.getDataAsJson<string[]>())
      .awaitStableValue();
    expect(keys).toEqual([
      "assetCache",
      "assetDescriptors",
      "assetRules",
      "assets",
      "dirsToCreate",
      "fileSetsContentToSave",
      "fileSetsToSave",
      "filesContentToSave",
      "filesToAdd",
      "filesToSave",
      "filesToStream",
      "filesToWrite",
      "runOptions",
      "softwareInfo",
      "wdProcessors",
    ]);

    const dump = await result
      .computeOutput("dump", (a) => a?.getDataAsJson<string>())
      .awaitStableValue();
    expect(dump).toContain(
      'runOptions=json/object:{"args":["-c","cat in.txt \\u003e out.txt; echo done"],"cmd":null,"envs":{"A":"1"},"nErrorLines":200,"queue":"medium","secrets":{},"software":',
    );
    expect(dump).toContain('filesToSave=json/object:["out.txt","stdout.txt"]');
    expect(dump).toContain('filesContentToSave=json/object:["out.txt","stderr.txt"]');
    expect(dump).toContain('filesToStream=json/object:["stdout.txt"]');
    expect(dump).not.toMatch(/fallback|attempt/i);
  },
);

// The canonical id of the exec.exec render itself, pinned to what the SDK before exec fallbacks
// (origin/main 2da829fae) produced for the same exec on the same backend. No software, so no
// package version enters it; it changes only with the exec's inputs, exec.exec's hash override,
// or the backend's id derivation.
const CID_BEFORE_FALLBACKS = "736d56c2025fb05b646ef548d3fe7840";

tplTest.concurrent(
  "AC3.1 exec without fallbacks: the exec.exec render has the CID it had before",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.cid_render",
      ["cid", "out"],
      () => ({}),
    );
    expect(await result.computeOutput("out", (a) => a?.getDataAsString()).awaitStableValue()).toBe(
      "hello",
    );
    expect(
      await result.computeOutput("cid", (a) => a?.getDataAsJson<string>()).awaitStableValue(),
    ).toBe(CID_BEFORE_FALLBACKS);
  },
);
