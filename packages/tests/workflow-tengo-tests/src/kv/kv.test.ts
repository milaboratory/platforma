import { resourceType } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

tplTest.concurrent("test reading kv existing", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(true, "kv.kv", ["output1"], (tx) => {
    const eph = tx.createEphemeral(resourceType("TestEph", "1"));
    tx.setKValue(eph, "a", "Truman Show");
    tx.lockInputs(eph);
    return {
      input1: eph,
    };
  });
  const mainResult = result.computeOutput("output1", (a) => a?.getDataAsJson());
  expect(await mainResult.awaitStableValue()).eq("Truman Show");
});

tplTest.concurrent("test reading kv absent", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(true, "kv.kv", ["output1"], (tx) => {
    const eph = tx.createEphemeral(resourceType("TestEph", "1"));
    tx.lockInputs(eph);
    return {
      input1: eph,
    };
  });
  const mainResult = result.computeOutput("output1", (a) => a?.getDataAsJson());
  expect(await mainResult.awaitStableValue()).eq("undefined");
});

tplTest.concurrent("test reading kv absent", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(true, "kv.kv", ["output1"], (tx) => {
    const eph = tx.createEphemeral(resourceType("TestEph", "1"));
    tx.lockInputs(eph);
    return {
      input1: eph,
    };
  });
  const mainResult = result.computeOutput("output1", (a) => a?.getDataAsJson());
  expect(await mainResult.awaitStableValue()).eq("undefined");
});

tplTest.concurrent("test writing kv", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(true, "kv.kv", ["output2"], (tx) => {
    const eph = tx.createEphemeral(resourceType("TestEph", "1"));
    tx.lockInputs(eph);
    return {
      input1: eph,
    };
  });
  const mainResult = result.computeOutput("output2", (b) => b?.getKeyValueAsString("b"));
  expect(await mainResult.awaitStableValue()).eq("The Value");
});
