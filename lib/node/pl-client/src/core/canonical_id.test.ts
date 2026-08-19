import { getTestLLClient, withTempRoot } from "../test/test_config";
import { StructTestResource, ValueTestResource } from "../helpers/pl";
import { field } from "./transaction";
import type { SignedResourceId } from "./types";
import { parseSignedResourceId } from "./types";
import { TxAPI_Open_Request_WritableTx } from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";
import { notEmpty } from "@milaboratories/ts-helpers";
import { test, expect } from "vitest";

/**
 * Reads the canonical id the server exposes for each resource, in one read-only
 * transaction of its own.
 *
 * The request goes through the low-level client because the high-level
 * {@link PlTransaction.getResourceData} drops the `canonicalId` field of the
 * wire message. The canonical id here is exactly what any API client sees.
 */
async function readExposedCanonicalIds(ids: SignedResourceId[]): Promise<Uint8Array[]> {
  // The suite-wide default request timeout is deliberately short (500 ms); this
  // read runs while the rest of the suite loads the same server, so it gets a
  // timeout of its own to stay stable.
  const client = await getTestLLClient({ defaultRequestTimeout: 10_000 });
  try {
    const tx = client.createTx(false);
    try {
      await tx.send(
        {
          oneofKind: "txOpen",
          txOpen: {
            name: "readExposedCanonicalIds",
            writable: TxAPI_Open_Request_WritableTx.NOT_WRITABLE,
            enableFormattedErrors: false,
          },
        },
        false,
      );

      const canonicalIds: Uint8Array[] = [];
      for (const id of ids) {
        const { globalId, signature } = parseSignedResourceId(id);
        const response = await tx.send(
          {
            oneofKind: "resourceGet",
            resourceGet: {
              resourceId: globalId,
              resourceSignature: signature,
              loadFields: false,
              showSoftDeletes: false,
            },
          },
          false,
        );
        canonicalIds.push(notEmpty(response.resourceGet.resource).canonicalId);
      }

      return canonicalIds;
    } finally {
      await tx.complete();
      await tx.await();
    }
  } finally {
    await client.close();
  }
}

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
 * client observes after the commit, not what the writing transaction sees.
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

    // Confirm the resources are what this test claims they are, then check the
    // canonical id of each one.
    const [valueData, structData] = await pl.withReadTx("checkResourceKinds", async (tx) => {
      return await Promise.all([
        tx.getResourceData(valueId, false),
        tx.getResourceData(structId, false),
      ]);
    });

    expect(valueData.kind).toEqual("Value");
    expect(structData.kind).toEqual("Structural");
    expect(structData.final).toBe(true);

    const [valueCid, structCid] = await readExposedCanonicalIds([valueId, structId]);

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
