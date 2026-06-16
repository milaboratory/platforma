import { describe, test, expect } from "vitest";
import { buildDerivedPinLookupForPins, createMockRegistryClient } from "../registry-client";

describe("buildDerivedPinLookupForPins (mocked registry)", () => {
  test("resolves the catalog entry to the source's declared exact dep version", async () => {
    const client = createMockRegistryClient(
      { "@platforma-sdk/ui-vue": "1.79.6" },
      { "@platforma-sdk/ui-vue@1.79.6": { vue: "3.5.24" } },
    );
    const lookup = await buildDerivedPinLookupForPins(
      [{ entry: "vue", of: "@platforma-sdk/ui-vue" }],
      client,
    );
    expect(lookup("vue")).toBe("3.5.24");
    expect(lookup("unrelated")).toBeUndefined();
  });

  test("reads from a pinned source version when `ofVersion` is given", async () => {
    const client = createMockRegistryClient(
      { "@platforma-sdk/ui-vue": "9.9.9" }, // latest — must NOT be used
      { "@platforma-sdk/ui-vue@1.79.3": { vue: "3.5.20" } },
    );
    const lookup = await buildDerivedPinLookupForPins(
      [{ entry: "vue", of: "@platforma-sdk/ui-vue", ofVersion: "1.79.3" }],
      client,
    );
    expect(lookup("vue")).toBe("3.5.20");
  });

  test("empty pin list → lookup returns undefined for everything", async () => {
    const lookup = await buildDerivedPinLookupForPins([], createMockRegistryClient({}));
    expect(lookup("vue")).toBeUndefined();
  });

  test("policy (b): throws when the source declares a NON-EXACT range", async () => {
    const client = createMockRegistryClient(
      { "@platforma-sdk/ui-vue": "1.79.6" },
      { "@platforma-sdk/ui-vue@1.79.6": { vue: "^3.5.24" } },
    );
    await expect(
      buildDerivedPinLookupForPins([{ entry: "vue", of: "@platforma-sdk/ui-vue" }], client),
    ).rejects.toThrow(/not an exact version/i);
  });

  test("policy (b): throws when the source declares no such dependency", async () => {
    const client = createMockRegistryClient(
      { "@platforma-sdk/ui-vue": "1.79.6" },
      { "@platforma-sdk/ui-vue@1.79.6": { react: "19.0.0" } },
    );
    await expect(
      buildDerivedPinLookupForPins([{ entry: "vue", of: "@platforma-sdk/ui-vue" }], client),
    ).rejects.toThrow(/declares no/i);
  });
});
