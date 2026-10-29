import { resourceType } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

/*
 * A value resource gets its canonical ID at creation time.
 * The workflow must read the same non-empty canonical ID for equal values.
 */
tplTest.concurrent("smart resource exposes the canonical id", async ({ helper, expect }) => {
  const render = async () => {
    const result = await helper.renderTemplate(true, "smart.canonical-id", ["cid"], (tx) => ({
      // Not a JSON type: the template unmarshaller decodes JSON inputs, and the template needs the resource.
      value: tx.createValue(resourceType("TestValue", "1"), "canonical id test value"),
    }));
    return await result.computeOutput("cid", (a) => a?.getDataAsJson<string>()).awaitStableValue();
  };

  const cid1 = await render();
  const cid2 = await render();

  expect(cid1).toMatch(/^[0-9a-f]+$/);
  expect(cid2).eq(cid1);
});
