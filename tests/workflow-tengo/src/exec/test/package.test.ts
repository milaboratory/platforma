import { Pl } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from "@platforma-sdk/test";

tplTest("package-loads-and-installs", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    "exec.test.pkg.pkg-install",
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

tplTest("pkg-file-is-exported", async ({ helper, expect, driverKit }) => {
  const result = await helper.renderTemplate(
    false,
    "exec.test.pkg.pkg-export",
    ["pkgFileContent", "pkgFile"],
    (tx) => ({})
  );

  // Wait for asset content
  const assetContentOutput = result.computeOutput("pkgFileContent", (a) => a?.getDataAsJson());
  const assetContent = await assetContentOutput.awaitStableValue()

  // Wait for asset file and download it's data
  const assetFileOutput = result.computeOutput("pkgFile", (a, ctx) => {
    if (a === undefined) {
      return a
    }

    return driverKit.blobDriver.getOnDemandBlob(a.persist(), ctx).handle
  })

  const assetFile = await assetFileOutput.awaitStableValue()

  const assetData = JSON.parse(Buffer.from(
    await driverKit.blobDriver.getContent(assetFile!)
  ).toString('utf-8'))

  expect(assetContent).toHaveProperty("binary")
  expect(assetData).toHaveProperty("binary")
  expect(assetContent).toEqual(assetData)
});
