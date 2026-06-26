import type winston from "winston";
import { Core } from "./core/core";

export * as util from "./core/util";
export * as envs from "./core/envs";
export * as defaults from "./defaults";

/**
 * Public surface of the build engine. Derived from `Core` so signatures never
 * drift, while the `Core` class itself stays internal (per A-0023: the engine is
 * a library, not a half-binary with an exported orchestrator class). Consumers
 * (`pl-pkg`, and later `block-tools software`) wrap this, they do not subclass it.
 */
export type Builder = Pick<
  Core,
  | "buildMode"
  | "targetPlatform"
  | "allPlatforms"
  | "fullDirHash"
  | "version"
  | "isPrivate"
  | "buildDockerImages"
  | "buildSoftwareArchives"
  | "buildSwJsonFiles"
  | "writePublishedArtifactInfo"
  | "publishPackages"
  | "publishDockerImages"
>;

export function createBuilder(logger: winston.Logger, opts?: { packageRoot?: string }): Builder {
  return new Core(logger, opts);
}
