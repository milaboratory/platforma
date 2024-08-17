import { Pl } from '@milaboratory/pl-middle-layer';
import { tplTest } from "@milaboratory/sdk-test";

tplTest("package-loads-and-installs", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    "test.software.package-install",
    ["installed", "descriptor"],
    (tx) => ({})
  );
  const installedOutput = result.computeOutput("installed", (a) => a?.getDataAsJson());
  const descriptorOutput = result.computeOutput("descriptor", (a) => a?.getDataAsJson());

  const installed = await installedOutput.awaitStableValue()
  const descriptor = await descriptorOutput.awaitStableValue()

  expect(installed).toHaveProperty("origin")
  expect(installed).toHaveProperty("path")

  expect(descriptor).toHaveProperty("binary")
});
