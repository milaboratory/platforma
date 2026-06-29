import { Core } from "./core";
import { PackageInfo } from "./package-info";
import * as testArtifacts from "./schemas/test-artifacts";
import { createLogger } from "./util";
import { test, expect } from "vitest";

// Docker software is linux/amd64 only. An explicit non-x64 target must fail clearly, before any
// `docker build` runs, rather than silently producing an amd64 image.
test("buildDockerImages rejects a non-x64 target platform", () => {
  const logger = createLogger("error");
  const pkgInfo = new PackageInfo(logger, { pkgJsonData: testArtifacts.PackageJson });
  const core = new Core(logger, { pkgInfo });

  core.targetPlatform = "linux-aarch64";

  expect(() => core.buildDockerImages()).toThrow(/docker.*linux\/amd64 only/);
});
