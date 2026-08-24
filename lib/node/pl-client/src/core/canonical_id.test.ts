import { withTempRoot } from "../test/test_config";
import { StructTestResource, ValueTestResource } from "../helpers/pl";
import { field } from "./transaction";
import { test, expect } from "vitest";

/**
 * Every pure resource must expose a non-empty canonical id to clients once its
 * creating transaction is committed.
 *
 * Regression test. The canonical id the server puts on the wire comes from a
 * single field that only deduplication used to write. Deduplication needs all
 * inputs final, which never happens for a resource that has no input fields at
 * all — value and singleton resources. Both therefore reported an empty
 * canonical id to every client forever, with no state they could reach to fix
 * it. The defect shipped twice and was found by hand during release
 * validation, so the check lives here, in a package that both monorepo suites
 * of the backend CI run on every pull request.
 *
 * Singleton resources have the same shape and had the same defect, but the
 * backend limits their creation to access-controller clients, so a normal API
 * client cannot build one. The value resource below covers the same code path;
 * the singleton case is covered by the backend unit test
 * (platform/core/coretest/value_resource_canonical_id_test.go).
 *
 * The read happens in a separate transaction on purpose: the subject is what a
 * client observes after the commit, not what the writing transaction sees. It
 * stays on the same client, because resource signatures are bound to the
 * session that minted them and a user-role client may not replay them
 * elsewhere.
 */
test("pure resources expose a canonical id to clients after commit", async () => {
  await withTempRoot(async (pl) => {
    const [valueId, structId] = await pl.withWriteTx(
      "createPureResources",
      async (tx) => {
        const value = tx.createValue(ValueTestResource, Buffer.from("canonical id test value"));
        // A structural resource with no fields reaches its final state as soon
        // as both of its field sets are locked.
        const struct = tx.createStruct(StructTestResource);
        tx.lock(struct);

        // Keep both reachable from the client root, so neither is collected
        // before the reading transaction below.
        tx.createField(field(tx.clientRoot, "value"), "Dynamic", value);
        tx.createField(field(tx.clientRoot, "struct"), "Dynamic", struct);

        await tx.commit();
        return [await value.globalId, await struct.globalId];
      },
      { sync: true },
    );

    const { valueData, structData, valueCid, structCid } = await pl.withReadTx(
      "readCanonicalIds",
      async (tx) => {
        // Confirm the resources are what this test claims they are, then read
        // the canonical id the server exposes for each one.
        return {
          valueData: await tx.getResourceData(valueId, false),
          structData: await tx.getResourceData(structId, false),
          valueCid: await tx.getResourceCanonicalId(valueId),
          structCid: await tx.getResourceCanonicalId(structId),
        };
      },
    );

    expect(valueData.kind).toEqual("Value");
    expect(structData.kind).toEqual("Structural");
    expect(structData.final).toBe(true);

    expect(
      valueCid.length,
      `value resource ${valueId} exposes an empty canonical id`,
    ).toBeGreaterThan(0);
    expect(
      structCid.length,
      `structural resource ${structId} exposes an empty canonical id`,
    ).toBeGreaterThan(0);
  });
});
