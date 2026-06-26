import { PackageInfo } from "./package-info";
import * as testArtifacts from "./schemas/test-artifacts";
import { createLogger, isDevMode, producesRegistryDescriptor } from "./util";
import * as envs from "./envs";
import { test, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

test("content-addressable dev naming appends a content hash", () => {
  const l = createLogger("error");

  // Real package root so the asset's "./src" content root resolves and can be hashed.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-info-dev-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "a.txt"), "hello");

  const i = new PackageInfo(l, { packageRoot: root, pkgJsonData: testArtifacts.PackageJson });
  const asset = i.getArtifact(testArtifacts.EPNameAsset, "asset");
  const docker = i.getArtifact(testArtifacts.EPNameDocker, "docker");

  // Release (default): version-derived, no suffix.
  expect(i.artifactVersion(asset)).toEqual(testArtifacts.PackageVersion);

  // Dev: a `-<12 hex>` content suffix, deterministic for unchanged content.
  i.buildMode = "dev-local";
  const dev1 = i.artifactVersion(asset);
  expect(dev1).toMatch(new RegExp(`^${testArtifacts.PackageVersion}-[0-9a-f]{12}$`));
  expect(i.artifactVersion(asset)).toEqual(dev1);

  // Docker stays version-derived (already content-addressed via its image-ID tag).
  expect(i.artifactVersion(docker)).toEqual(testArtifacts.PackageVersion);

  // Reproducible: identical content at a different absolute location yields the same suffix
  // (hash is over relative paths + file contents, sorted — not the build directory).
  const root2 = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-info-dev-"));
  fs.mkdirSync(path.join(root2, "src"));
  fs.writeFileSync(path.join(root2, "src", "a.txt"), "hello");
  const i2 = new PackageInfo(l, { packageRoot: root2, pkgJsonData: testArtifacts.PackageJson });
  i2.buildMode = "dev-local";
  expect(i2.artifactVersion(i2.getArtifact(testArtifacts.EPNameAsset, "asset"))).toEqual(dev1);

  // Changed content ⟹ a different name.
  fs.writeFileSync(path.join(root, "src", "b.txt"), "world");
  expect(i.artifactVersion(asset)).not.toEqual(dev1);

  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(root2, { recursive: true, force: true });
});

test("build-mode predicates split channel from descriptor shape", () => {
  expect(isDevMode("dev-local")).toBe(true);
  expect(isDevMode("dev-remote")).toBe(true);
  expect(isDevMode("release")).toBe(false);

  // dev-local is the only same-host mode: it does NOT build an archive / registry descriptor.
  expect(producesRegistryDescriptor("dev-local")).toBe(false);
  expect(producesRegistryDescriptor("dev-remote")).toBe(true);
  expect(producesRegistryDescriptor("release")).toBe(true);
});

const devUploadEnv = envs.PL_DEV_BINARY_UPLOAD_URL;
const releaseUploadEnv = envs.PL_RELEASE_BINARY_UPLOAD_URL;
afterEach(() => {
  delete process.env[devUploadEnv];
  delete process.env[releaseUploadEnv];
});

test("dev channel flips the embedded binary registry name to midev/dev", () => {
  const l = createLogger("error");
  const i = new PackageInfo(l, { pkgJsonData: testArtifacts.SingleBinaryackageJson });
  const binary = i.getArtifact(testArtifacts.EPNameBinary, "binary");

  // Release: keeps the artifact's resolved registry name (default platforma-open here).
  const releaseName = i.artifactRegistrySettings(binary).name;
  expect(releaseName).toEqual("platforma-open");

  // Dev, built-in default: name flips to midev, no upload URL forced.
  i.buildMode = "dev-remote";
  expect(i.artifactRegistrySettings(binary).name).toEqual("midev");

  // Dev with an explicit endpoint: name flips to dev and the upload URL routes there.
  process.env[devUploadEnv] = "s3://my-bucket/dev?region=eu-central-1";
  const dev = i.artifactRegistrySettings(binary);
  expect(dev.name).toEqual("dev");
  expect(dev.storageURL).toEqual("s3://my-bucket/dev?region=eu-central-1");

  // dev-local channel behaves the same for naming.
  i.buildMode = "dev-local";
  expect(i.artifactRegistrySettings(binary).name).toEqual("dev");
});

test("release honors PL_RELEASE_BINARY_UPLOAD_URL without renaming", () => {
  const l = createLogger("error");
  const i = new PackageInfo(l, { pkgJsonData: testArtifacts.SingleBinaryackageJson });
  const binary = i.getArtifact(testArtifacts.EPNameBinary, "binary");

  process.env[releaseUploadEnv] = "s3://release-bucket/pub?region=eu-central-1";
  const rel = i.artifactRegistrySettings(binary);
  expect(rel.name).toEqual("platforma-open");
  expect(rel.storageURL).toEqual("s3://release-bucket/pub?region=eu-central-1");
});
