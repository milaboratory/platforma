import { PackageInfo } from "./package-info";
import * as testArtifacts from "./schemas/test-artifacts";
import { createLogger } from "./util";
import { test, expect } from "vitest";

test("PackageInfo loads correctly for single binary package", () => {
  const l = createLogger("error");

  const i = new PackageInfo(l, {
    pkgJsonData: testArtifacts.SingleBinaryackageJson,
  });

  const binary = i.getArtifact(testArtifacts.EPNameBinary, "binary");
  expect(i.artifactName(binary)).toEqual(
    testArtifacts.PackageNameNoAt + "/" + testArtifacts.EPNameBinary,
  );
  expect(i.artifactVersion(binary)).toEqual(testArtifacts.PackageVersion);
});

test("PackageInfo loads correctly for multi-package", () => {
  const l = createLogger("error");

  const i = new PackageInfo(l, {
    pkgJsonData: testArtifacts.PackageJson,
  });

  const asset = i.getArtifact(testArtifacts.EPNameAsset, "asset");
  let registry = i.artifactRegistrySettings(asset);
  expect(registry.name).toEqual(testArtifacts.BinaryRegistry);
  expect(i.artifactName(asset)).toEqual(testArtifacts.PackageNameNoAt + "/pAsset");
  expect(i.artifactVersion(asset)).toEqual(testArtifacts.PackageVersion);
  expect(asset.root).toEqual("./src");

  const binary = i.getArtifact(testArtifacts.EPNameCustomName, "binary");
  registry = i.artifactRegistrySettings(binary);
  expect(registry.name).toEqual(testArtifacts.BinaryRegistry);
  expect(i.artifactName(binary)).toEqual(testArtifacts.BinaryCustomName1);
  expect(i.artifactVersion(binary)).toEqual(testArtifacts.BinaryCustomVersion);

  const environment = i.getArtifact(testArtifacts.EPNameJavaEnvironment, "environment");
  registry = i.artifactRegistrySettings(environment);
  expect(registry.name).toEqual(testArtifacts.BinaryRegistry);
  expect(i.artifactName(environment)).toEqual(
    testArtifacts.PackageNameNoAt + "/" + testArtifacts.EPNameJavaEnvironment,
  );
  expect(i.artifactVersion(environment)).toEqual(testArtifacts.PackageVersion);
});

test("Limited list of supported platforms", () => {
  const l = createLogger("error");

  const i = new PackageInfo(l, {
    pkgJsonData: testArtifacts.PackageJson,
  });

  const binary = i.getArtifact(testArtifacts.EPNameLimitedPlatformsBinary, "binary");
  const platforms = i.artifactPlatforms(binary);
  expect(platforms).toEqual(["linux-x64", "macosx-aarch64"]);
});

test("PackageInfo considers version override", () => {
  const l = createLogger("error");

  const i = new PackageInfo(l, {
    pkgJsonData: testArtifacts.PackageJson,
  });

  const customVersion = "my-custom-version";
  i.version = customVersion;

  const asset = i.getArtifact("pAsset", "asset");
  expect(i.artifactVersion(asset)).toEqual(customVersion);

  const binary = i.getArtifact(testArtifacts.EPNameCustomName, "binary");
  expect(i.artifactVersion(binary)).toEqual(customVersion);

  const environment = i.getArtifact(testArtifacts.EPNameJavaEnvironment, "environment");
  expect(i.artifactVersion(environment)).toEqual(customVersion);

  const java = i.getArtifact(testArtifacts.EPNameJava, "java");
  expect(i.artifactVersion(java)).toEqual(customVersion);
});
