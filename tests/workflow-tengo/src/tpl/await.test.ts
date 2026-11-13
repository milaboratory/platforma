import type { ResourceId } from "@milaboratories/pl-middle-layer";
import { Pl, field, resourceType, toGlobalResourceId } from "@milaboratories/pl-middle-layer";
import type { TplTestHelpers } from "@platforma-sdk/test";
import { tplTest } from "@platforma-sdk/test";
import crypto from "crypto";
import { Templates } from "../..";

tplTest.concurrent.for([
  { isEph: true, name: "ephemeral" },
  { isEph: false, name: "pure" },
])("test await simple state ($name)", async ({ isEph }, { pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  const result = await helper.renderTemplate(
    true,
    Templates["tpl.await-state-1"],
    ["main"],
    async (tx) => {
      inputResource = await toGlobalResourceId(
        isEph
          ? tx.createEphemeral(resourceType("TestEph", "1"))
          : tx.createStruct(resourceType("TestEph", "1")),
      );
      return {
        input1: inputResource,
      };
    },
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.createField(field(inputResource, "nestedField"), "Input");
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.lockInputs(inputResource);
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.setField(field(inputResource, "nestedField"), tx.createValue(Pl.JsonObject, "{}"));
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.awaitStableValue()).eq("A");
});

tplTest.concurrent.for([
  { isEph: true, name: "ephemeral" },
  { isEph: false, name: "pure" },
])("await simple state with duplicate ($name)", async ({ isEph }, { pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  let r1: ResourceId = 0n as ResourceId; // hack; original
  let r2: ResourceId = 0n as ResourceId; // hack; duplicate
  const uuid = crypto.randomUUID();

  const result = await helper.renderTemplate(
    true,
    Templates["tpl.await-state-1"],
    ["main"],
    async (tx) => {
      inputResource = await toGlobalResourceId(
        isEph
          ? tx.createEphemeral(resourceType("TestRes", "1"))
          : tx.createStruct(resourceType("TestRes", "1")),
      );
      r1 = await toGlobalResourceId(
        isEph
          ? tx.createEphemeral(resourceType("TestRes", "1"))
          : tx.createStruct(resourceType("TestRes", "1")),
      );
      const r1f1 = field(r1, "f1");
      tx.createField(r1f1, "Input");
      tx.setField(r1f1, tx.createValue(Pl.JsonObject, JSON.stringify({ uuid })));
      tx.lockInputs(r1);
      return {
        input1: inputResource,
        r1: r1,
      };
    },
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    const nestedField = field(inputResource, "nestedField");
    tx.createField(nestedField, "Input");
    r2 = await toGlobalResourceId(
      isEph
        ? tx.createEphemeral(resourceType("TestRes", "1"))
        : tx.createStruct(resourceType("TestRes", "1")),
    );
    tx.createField(field(r2, "f1"), "Input");
    tx.lockInputs(inputResource);
    tx.lockInputs(r2);
    tx.setField(nestedField, r2);

    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.setField(field(r2, "f1"), tx.createValue(Pl.JsonObject, JSON.stringify({ uuid })));
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.awaitStableValue()).eq("A");
});

tplTest.concurrent.for([
  { isEph: true, name: "ephemeral" },
  { isEph: false, name: "pure" },
])("await simple state with field error ($name)", async ({ isEph }, { pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  let r1: ResourceId = 0n as ResourceId; // hack

  const result = await helper.renderTemplate(
    true,
    Templates["tpl.await-state-1"],
    ["main"],
    async (tx) => {
      inputResource = await toGlobalResourceId(
        isEph
          ? tx.createEphemeral(resourceType("TestRes", "1"))
          : tx.createStruct(resourceType("TestRes", "1")),
      );
      const nestedField = field(inputResource, "nestedField");
      tx.createField(nestedField, "Input");
      r1 = await toGlobalResourceId(
        isEph
          ? tx.createEphemeral(resourceType("TestRes", "1"))
          : tx.createStruct(resourceType("TestRes", "1")),
      );
      const r1f1 = field(r1, "f1");
      tx.createField(r1f1, "Input");
      tx.lockInputs(r1);
      // setting nestedField to reference f1 of r1
      tx.setField(nestedField, r1f1);
      return {
        input1: inputResource,
      };
    },
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    const r1f1 = field(r1, "f1");
    tx.setFieldError(r1f1, tx.createError("the_test_error"));
    await tx.commit();
  });
  await mainResult.refreshState();
  await expect(async () => await mainResult.awaitStableValue()).rejects.toThrow(/the_test_error/);
});

tplTest.concurrent.for([
  { isEph: true, name: "ephemeral" },
  { isEph: false, name: "pure" },
])("await simple state with resource error ($name)", async ({ isEph }, { pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  let r1: ResourceId = 0n as ResourceId; // hack
  let r2: ResourceId = 0n as ResourceId; // hack
  const uuid = crypto.randomUUID();

  const result = await helper.renderTemplate(
    true,
    Templates["tpl.await-state-1"],
    ["main"],
    async (tx) => {
      inputResource = await toGlobalResourceId(
        isEph
          ? tx.createEphemeral(resourceType("TestRes", "1"))
          : tx.createStruct(resourceType("TestRes", "1")),
      );
      // r1 resource will keep input template from ready state, and prevent automatic error propagation mechanism from engaging
      r1 = await toGlobalResourceId(
        isEph
          ? tx.createEphemeral(resourceType("TestRes", "1"))
          : tx.createStruct(resourceType("TestRes", "1"), uuid),
      );
      tx.createField(field(r1, "f1"), "Input");
      tx.lockInputs(r1);
      return {
        input1: inputResource,
        r1,
      };
    },
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    const nestedField = field(inputResource, "nestedField");
    tx.createField(nestedField, "Input");
    r2 = await toGlobalResourceId(
      isEph
        ? tx.createEphemeral(resourceType("TestRes", "1"))
        : tx.createStruct(resourceType("TestRes", "1")),
    );
    tx.createField(field(r2, "f1"), "Input");
    tx.lockInputs(inputResource);
    tx.lockInputs(r2);
    tx.setField(nestedField, r2);

    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.setResourceError(r2, tx.createError("the_test_error"));
    await tx.commit();
  });
  await mainResult.refreshState();
  await expect(async () => await mainResult.awaitStableValue()).rejects.toThrow(/the_test_error/);
});

tplTest.concurrent("test error field absent", async ({ pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  const result = await helper.renderTemplate(true, "tpl.await-state-1", ["main"], async (tx) => {
    inputResource = await toGlobalResourceId(tx.createStruct(resourceType("TestEph", "1")));
    return {
      input1: inputResource,
    };
  });
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.createField(field(inputResource, "nestedField1"), "Input");
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.lockInputs(inputResource);
    await tx.commit();
  });
  await expect(async () => await mainResult.awaitStableFullValue()).rejects.toThrow(
    /not found and inputs locked/,
  );
});

tplTest.concurrent("test await state with wildcards #1", async ({ pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  const result = await helper.renderTemplate(
    true,
    Templates["tpl.await-state-wildcard"],
    ["main"],
    async (tx) => {
      inputResource = await toGlobalResourceId(tx.createStruct(resourceType("TestEph", "1")));
      return {
        input1: inputResource,
      };
    },
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.createField(field(inputResource, "nestedField"), "Input");
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.lockInputs(inputResource);
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.setField(field(inputResource, "nestedField"), tx.createValue(Pl.JsonObject, "{}"));
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.awaitStableValue()).eq("A");
});

tplTest.concurrent("test await state with wildcards #2", async ({ pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  const result = await helper.renderTemplate(
    true,
    Templates["tpl.await-state-wildcard"],
    ["main"],
    async (tx) => {
      inputResource = await toGlobalResourceId(tx.createStruct(resourceType("Test", "1")));
      return {
        input1: inputResource,
      };
    },
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.createField(field(inputResource, "nestedField"), "Input");
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  let nestedResource1: ResourceId = 0n as ResourceId; // hack

  await pl.withWriteTx("Test", async (tx) => {
    tx.setField(field(inputResource, "nestedField"), tx.createValue(Pl.JsonObject, "{}"));
    nestedResource1 = await toGlobalResourceId(tx.createStruct(resourceType("Test", "1")));
    tx.createField(field(inputResource, "nestedField123"), "Input");
    tx.setField(field(inputResource, "nestedField123"), nestedResource1);
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.lockInputs(inputResource);
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.lockInputs(nestedResource1);
    await tx.commit();
  });
  await mainResult.refreshState();

  expect(await mainResult.awaitStableValue()).eq("AA");
});

tplTest.concurrent("test await state with match #1", async ({ pl, helper, expect }) => {
  let inputResource1: ResourceId = 0n as ResourceId; // hack
  const result = await helper.renderTemplate(
    true,
    Templates["tpl.await-state-match"],
    ["main"],
    async (tx) => {
      inputResource1 = await toGlobalResourceId(tx.createStruct(resourceType("Test", "1")));
      return {
        input1: inputResource1,
      };
    },
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.createField(field(inputResource1, "nestedFieldWithoutPrefix"), "Input");
    tx.createField(field(inputResource1, "the_prefix.nestedField"), "Input");
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  let nestedResource1: ResourceId = 0n as ResourceId; // hack

  await pl.withWriteTx("Test", async (tx) => {
    tx.setField(
      field(inputResource1, "the_prefix.nestedField"),
      tx.createValue(Pl.JsonObject, "{}"),
    );
    nestedResource1 = await toGlobalResourceId(tx.createStruct(resourceType("Test", "1")));
    tx.createField(field(inputResource1, "nestedFieldWithoutPrefix"), "Input", nestedResource1);
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx("Test", async (tx) => {
    tx.lockInputs(inputResource1);
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.awaitStableValue()).eq("1:1");
});

tplTest.concurrent(
  "test await state with match, check behaviour with errors",
  async ({ pl, helper, expect }) => {
    let inputResource1: ResourceId = 0n as ResourceId; // hack
    const result = await helper.renderTemplate(
      true,
      Templates["tpl.await-state-match"],
      ["main"],
      async (tx) => {
        inputResource1 = await toGlobalResourceId(tx.createStruct(resourceType("Test", "1")));
        return {
          input1: inputResource1,
        };
      },
    );
    const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
    await mainResult.refreshState();
    expect(await mainResult.getValue()).toBeUndefined();

    await pl.withWriteTx("Test", async (tx) => {
      tx.createField(field(inputResource1, "nestedFieldWithoutPrefix"), "Input");
      tx.createField(field(inputResource1, "the_prefix.nestedField"), "Input");
      await tx.commit();
    });
    await mainResult.refreshState();
    expect(await mainResult.getValue()).toBeUndefined();

    let nestedResource1: ResourceId = 0n as ResourceId; // hack

    await pl.withWriteTx("Test", async (tx) => {
      tx.setFieldError(
        field(inputResource1, "the_prefix.nestedField"),
        tx.createValue(
          { name: "json/resourceError", version: "1" },
          JSON.stringify({ message: "the_test_error" }),
        ),
      );
      nestedResource1 = await toGlobalResourceId(tx.createStruct(resourceType("Test", "1")));
      tx.createField(field(inputResource1, "nestedFieldWithoutPrefix"), "Input", nestedResource1);
      await tx.commit();
    });
    await mainResult.refreshState();
    expect(await mainResult.getValue()).toBeUndefined();

    await pl.withWriteTx("Test", async (tx) => {
      tx.lockInputs(inputResource1);
      await tx.commit();
    });
    await mainResult.refreshState();
    expect(async () => await mainResult.awaitStableValue()).rejects.toThrow(/the_test_error/);
  },
);

tplTest.concurrent(
  "PrimarySpecsReady: body runs when specs ready, data still computing",
  async ({ pl, helper, expect }) => {
    let inputResource: ResourceId = 0n as ResourceId;
    let columnResource: ResourceId = 0n as ResourceId;

    const result = await helper.renderTemplate(
      true,
      Templates["tpl.primary-specs-ready"],
      ["main"],
      async (tx) => {
        inputResource = await toGlobalResourceId(
          tx.createEphemeral(resourceType("TestPrimary", "1")),
        );
        return { input1: inputResource };
      },
    );

    const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
    await mainResult.refreshState();
    expect(await mainResult.getValue()).toBeUndefined();

    // Create column sub-resource with spec and data fields;
    // data points to an unfinished resource (simulates "still computing")
    await pl.withWriteTx("Test", async (tx) => {
      columnResource = await toGlobalResourceId(tx.createEphemeral(resourceType("TestCol", "1")));
      tx.createField(field(columnResource, "spec"), "Input");
      tx.createField(field(columnResource, "data"), "Input");

      // data -> unfinished resource (never becomes ready)
      const computing = await toGlobalResourceId(
        tx.createEphemeral(resourceType("Computing", "1")),
      );
      tx.setField(field(columnResource, "data"), computing);

      // Wire column into input and lock
      tx.createField(field(inputResource, "column"), "Input");
      tx.setField(field(inputResource, "column"), columnResource);
      tx.lockInputs(inputResource);

      await tx.commit();
    });

    // spec not set yet — body should not run
    await mainResult.refreshState();
    expect(await mainResult.getValue()).toBeUndefined();

    // Set spec to a ready value and lock column inputs
    await pl.withWriteTx("Test", async (tx) => {
      tx.setField(
        field(columnResource, "spec"),
        tx.createValue(Pl.JsonObject, JSON.stringify({ name: "col" })),
      );
      tx.lockInputs(columnResource);
      await tx.commit();
    });

    // spec is ready, data is still computing — body should run
    await mainResult.refreshState();
    expect(await mainResult.awaitStableValue()).eq("specs_ready");
  },
);

async function renderMultiHitBundle(helper: TplTestHelpers, family: 1 | 2) {
  const blockId = family === 1 ? "b1" : "b1/w1";
  const refs = ["c1", "c2"].map((name) => JSON.stringify({ blockId, name }));
  let dataField = field(0n as ResourceId, "data");

  const result = await helper.renderTemplate(
    true,
    Templates["tpl.bundle-multi-data-unset"],
    ["main", "first", "second"],
    async (tx) => {
      const specMap = tx.createStruct(resourceType("std/map", "1"));
      for (const [index, ref] of refs.entries()) {
        tx.createField(field(specMap, ref), "Input");
        tx.setField(
          field(specMap, ref),
          tx.createValue(Pl.JsonObject, JSON.stringify({ name: `col${index + 1}` })),
        );
      }
      tx.lockInputs(specMap);

      const queryResult = tx.createStruct(resourceType("BQueryResult", "1"));
      tx.createField(field(queryResult, "ops"), "Input");
      tx.setField(
        field(queryResult, "ops"),
        tx.createValue(
          Pl.JsonObject,
          JSON.stringify({ first: false, single: false, ...(family === 2 && { family }) }),
        ),
      );
      tx.createField(field(queryResult, "spec"), "Input");
      tx.setField(field(queryResult, "spec"), specMap);
      tx.createField(field(queryResult, "data"), "Input");
      tx.lockInputs(queryResult);
      dataField = field(await toGlobalResourceId(queryResult), "data");

      const bundle = tx.createStruct(resourceType("PColumnBundle", "1"));
      tx.createField(field(bundle, "cols"), "Input");
      tx.setField(field(bundle, "cols"), queryResult);
      tx.lockInputs(bundle);

      return { input1: await toGlobalResourceId(bundle) };
    },
  );

  return { result, refs, dataField };
}

tplTest.concurrent.for([{ family: 1 as const }, { family: 2 as const }])(
  "PColumnBundle: multi-hit query with data not set yet, one column still computing (family $family)",
  async ({ family }, { pl, helper, expect }) => {
    const { result, refs, dataField } = await renderMultiHitBundle(helper, family);

    const mainResult = result.computeOutput("main", (accessor) => accessor?.getDataAsJson());
    expect(await mainResult.awaitStableValue()).toStrictEqual({
      specs: [{ name: "col1" }, { name: "col2" }],
      dataIsField: [true, true],
    });

    const first = result.computeOutput("first", (accessor) => accessor?.getDataAsJson());
    const second = result.computeOutput("second", (accessor) => accessor?.getDataAsJson());
    await first.refreshState();
    expect(await first.getValue()).toBeUndefined();

    await pl.withWriteTx("Test", async (tx) => {
      const computing = tx.createStruct(resourceType("TestComputing", "1"));
      tx.createField(field(computing, "value"), "Input");

      const dataMap = tx.createStruct(resourceType("std/map", "1"));
      tx.createField(field(dataMap, refs[0]), "Input");
      tx.setField(field(dataMap, refs[0]), tx.createValue(Pl.JsonObject, JSON.stringify("data1")));
      tx.createField(field(dataMap, refs[1]), "Input");
      tx.setField(field(dataMap, refs[1]), field(computing, "value"));
      tx.lockInputs(dataMap);
      tx.setField(dataField, dataMap);
      await tx.commit();
    });

    expect(await first.awaitStableValue()).eq("data1");
    await second.refreshState();
    expect(await second.getValue()).toBeUndefined();
  },
);

tplTest.concurrent(
  "PColumnBundle: multi-hit query with data not set yet, column without data (family 2)",
  async ({ pl, helper, expect }) => {
    const { result, refs, dataField } = await renderMultiHitBundle(helper, 2);

    const mainResult = result.computeOutput("main", (accessor) => accessor?.getDataAsJson());
    expect((await mainResult.awaitStableValue())?.dataIsField).toStrictEqual([true, true]);

    const first = result.computeOutput("first", (accessor) => accessor?.getDataAsJson());
    const second = result.computeOutput("second", (accessor) => accessor?.resourceType.name);
    await second.refreshState();
    expect(await second.getValue()).toBeUndefined();

    await pl.withWriteTx("Test", async (tx) => {
      const dataMap = tx.createStruct(resourceType("std/map", "1"));
      tx.createField(field(dataMap, refs[0]), "Input");
      tx.setField(field(dataMap, refs[0]), tx.createValue(Pl.JsonObject, JSON.stringify("data1")));
      tx.lockInputs(dataMap);
      tx.setField(dataField, dataMap);
      await tx.commit();
    });

    expect(await first.awaitStableValue()).eq("data1");
    expect(await second.awaitStableValue()).eq("BResolveSingleNoResult");
  },
);

tplTest.concurrent.for([{ family: 1 as const }, { family: 2 as const }])(
  "PColumnBundle: multi-hit query with data not set yet, data error (family $family)",
  async ({ family }, { pl, helper, expect }) => {
    const { result, dataField } = await renderMultiHitBundle(helper, family);

    const mainResult = result.computeOutput("main", (accessor) => accessor?.getDataAsJson());
    expect((await mainResult.awaitStableValue())?.dataIsField).toStrictEqual([true, true]);

    const first = result.computeOutput("first", (accessor) => accessor?.getDataAsJson());
    await first.refreshState();
    expect(await first.getValue()).toBeUndefined();

    await pl.withWriteTx("Test", async (tx) => {
      tx.setFieldError(dataField, tx.createError("the_test_error"));
      await tx.commit();
    });

    await expect(first.awaitStableValue()).rejects.toThrow(/the_test_error/);
  },
);
