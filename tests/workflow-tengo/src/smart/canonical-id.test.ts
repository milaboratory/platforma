import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

/*
 * A pure template reads the canonical ID of its renderer from the template body.
 * Equal inputs give equal canonical IDs, different inputs give different ones.
 */
tplTest.concurrent(
  "pure template reads the canonical id of its renderer",
  async ({ helper, expect }) => {
    const render = async (value: string) => {
      const result = await helper.renderTemplate(false, "smart.canonical-id", ["cid"], (tx) => ({
        value: tx.createValue(Pl.JsonObject, JSON.stringify(value)),
      }));
      return await result
        .computeOutput("cid", (a) => a?.getDataAsJson<string>())
        .awaitStableValue();
    };

    const cidA = await render("canonical id test value A");
    const cidA2 = await render("canonical id test value A");
    const cidB = await render("canonical id test value B");

    expect(cidA).toMatch(/^[0-9a-f]+$/);
    expect(cidB).toMatch(/^[0-9a-f]+$/);
    expect(cidA2).eq(cidA);
    expect(cidB).not.eq(cidA);
  },
);

/*
 * An ephemeral renderer is not deduplicated and has no canonical ID.
 * The template must fail instead of giving an empty value.
 */
tplTest.concurrent("ephemeral template cannot read a canonical id", async ({ helper, expect }) => {
  await expect(async () => {
    const result = await helper.renderTemplate(true, "smart.canonical-id", ["cid"], (tx) => ({
      value: tx.createValue(Pl.JsonObject, JSON.stringify("canonical id test value")),
    }));
    await result.computeOutput("cid", (a) => a?.getDataAsJson<string>()).awaitStableValue();
  }).rejects.toThrow(/canonical ID is not available in ephemeral templates/);
});
