import { Command, Option, type OptionValues } from "commander";
import * as util from "./util";
import * as envs from "./envs";

// Parsed option bag handed to command handlers (commander camelCases flag names:
// --package-id -> packageId, --docker-build -> dockerBuild, etc.).
export type AnyOptions = OptionValues;

/** Add one or more groups of options to a command, preserving group order. */
export function addOptions(cmd: Command, ...optionGroups: Option[][]): Command {
  for (const group of optionGroups) {
    for (const opt of group) cmd.addOption(opt);
  }
  return cmd;
}

/**
 * Flag bag in the original (oclif) shape, so command bodies keep referencing
 * flags by their CLI names (`flags["package-id"]`, `flags.dev`, ...) unchanged.
 * `toFlags` is the only adapter between commander's camelCased option values
 * and that shape — it is pure parsing glue; command logic is untouched.
 */
export interface Flags {
  "log-level"?: string;
  "package-root"?: string;
  force: boolean;
  dev?: devModeName;
  version?: string;
  platform?: string;
  "all-platforms": boolean;
  "full-dir-hash": boolean;
  "docker-registry"?: string;
  "docker-push-to"?: string;
  "docker-build": boolean;
  "docker-no-build": boolean;
  "docker-autopush": boolean;
  "docker-no-autopush": boolean;
  "conda-build": boolean;
  "conda-no-build": boolean;
  entrypoint?: string[];
  "package-id"?: string[];
  archive?: string;
  "content-root"?: string;
  "storage-url"?: string;
  "fail-existing-packages": boolean;
}

export function toFlags(o: AnyOptions): Flags {
  return {
    "log-level": o.logLevel,
    "package-root": o.packageRoot,
    force: o.force,
    dev: o.dev,
    version: o.version,
    platform: o.platform,
    "all-platforms": o.allPlatforms,
    "full-dir-hash": o.fullDirHash,
    "docker-registry": o.dockerRegistry,
    "docker-push-to": o.dockerPushTo,
    "docker-build": o.dockerBuild,
    "docker-no-build": o.dockerNoBuild,
    "docker-autopush": o.dockerAutopush,
    "docker-no-autopush": o.dockerNoAutopush,
    "conda-build": o.condaBuild,
    "conda-no-build": o.condaNoBuild,
    entrypoint: o.entrypoint,
    "package-id": o.packageId,
    archive: o.archive,
    "content-root": o.contentRoot,
    "storage-url": o.storageUrl,
    "fail-existing-packages": o.failExistingPackages,
  };
}

// Collector for repeatable options (oclif `multiple: true` equivalent).
// No default value: absent -> undefined, present -> string[]. This preserves
// the `flags["package-id"] ? ... : undefined` checks in the command bodies
// (an empty `[]` would be truthy and change behavior).
function collect(value: string, previous?: string[]): string[] {
  return previous ? [...previous, value] : [value];
}

export const GlobalOptions = (): Option[] => [
  new Option("--log-level <level>", "logging level")
    .choices(["error", "warn", "info", "debug"])
    .default("info"),
  new Option("--package-root <path>", "path to directory with package.json file"),
];

export const ForceOption = (): Option[] => [
  new Option("--force", "force action, ignoring automatic safety checks").default(false),
];

export const FailExistingPackagesOption = (): Option[] => [
  new Option(
    "--fail-existing-packages",
    "fail for package archives that already exist in registry",
  ).default(false),
];

const devModeValues = ["local"] as const;
export type devModeName = (typeof devModeValues)[number];

export const BuildOptions = (): Option[] => [
  new Option("--dev <mode>", "build dev version of descriptor")
    .choices([...devModeValues])
    .env(envs.PL_PKG_DEV),
];

export const CondaOptions = (): Option[] => [
  new Option("--conda-build", "build conda environment before packing archive")
    .env(envs.PL_CONDA_BUILD)
    .default(false),
  new Option("--conda-no-build", "do not build conda environment before packing archive")
    .env(envs.PL_CONDA_NO_BUILD)
    .default(false),
];

// ponytail: commander treats a boolean .env() var as true whenever it is
// *defined* (even "0"/""), unlike oclif which parsed the value. All callers
// set these to "1" to enable and unset to disable, so behavior is unchanged;
// revisit only if a "PL_DOCKER_*=0 means off" convention ever appears.
export const DockerOptions = (): Option[] => [
  new Option(
    "--docker-registry <registry>",
    "docker registry Platforma Backend will use to pull image with this software.",
  ).env(envs.PL_DOCKER_REGISTRY),
  new Option(
    "--docker-push-to <registry>",
    "alternative registry for docker push. This allows to push docker image to different registry compared to what would be used for docker pull on Platforma Backend side.",
  ).env(envs.PL_DOCKER_REGISTRY_PUSH_TO),

  new Option("--docker-build", "build docker images").env(envs.PL_DOCKER_BUILD).default(false),
  new Option("--docker-no-build", "do not build docker images")
    .env(envs.PL_DOCKER_NO_BUILD)
    .default(false)
    .conflicts("dockerBuild"),

  new Option(
    "--docker-autopush",
    "push docker images after build. Enabled by default in CI builds.",
  )
    .env(envs.PL_DOCKER_AUTOPUSH)
    .default(false),
  new Option("--docker-no-autopush", "do not push docker images after build")
    .env(envs.PL_DOCKER_NO_AUTOPUSH)
    .default(false)
    .conflicts("dockerAutopush"),
];

// Single docker option reused by publish commands (push target only).
export const DockerPushToOption = (): Option =>
  new Option(
    "--docker-push-to <registry>",
    "alternative registry for docker push. This allows to push docker image to different registry compared to what would be used for docker pull on Platforma Backend side.",
  ).env(envs.PL_DOCKER_REGISTRY_PUSH_TO);

export const DirHashOption = (): Option[] => [
  new Option(
    "--full-dir-hash",
    "when calculating software hash in dev=local mode, hash file contents instead of metadata.\n" +
      "This makes descriptor file generation slower, but makes Platforma deduplication to work better, restarting" +
      " calculations only when they readlly should be.",
  )
    .env(envs.PL_PKG_FULL_HASH)
    .default(false),
];

export const EntrypointNameOption = (): Option[] => [
  new Option("--entrypoint <name>", "build only selected entrypoints").argParser(collect),
];

export const PackageIDOption = (): Option[] => [
  new Option("--package-id <id>", "build/publish only selected packages").argParser(collect),
];

export const VersionOption = (): Option[] => [
  // NB: PL_PKG_VERSION env is read 'globally' right inside package-info.ts, so
  // it is intentionally not bound here as an option env.
  new Option(
    "--version <value>",
    "override version of package to be built (ignore versions in package.json)",
  ),
];

export const PlatformOptions = (): Option[] => [
  new Option(
    "--platform <os-arch>",
    "{os}-{arch} pair, supported by software. Has no effect on cross-platform software packages",
  )
    .choices([...util.AllPlatforms])
    .env(envs.PL_PKG_OS),

  new Option(
    "--all-platforms",
    "build/publish software packages for all platforms supported by these packages",
  ).default(false),
];

export const ArchiveOption = (): Option[] => [
  new Option(
    "--archive <path>",
    "path to archive with the pacakge to be built/published. Overrides <os> and <arch> options",
  ).env(envs.PL_PKG_ARCHIVE),
];

export const StorageURLOption = (): Option[] => [
  new Option(
    "--storage-url <url>",
    "publish package archive into given registry, specified by URL, e.g. s3://<bucket>/<some-path-prefix>?region=<region>",
  ).env(envs.PL_PKG_STORAGE_URL),
];

export const ContentRootOption = (): Option[] => [
  new Option(
    "--content-root <path>",
    "path to directory with contents of software package. Overrides settings in package.json",
  ).env(envs.PL_PKG_CONTENT_ROOT),
];

export function modeFromFlag(dev?: devModeName): util.BuildMode {
  switch (dev) {
    case "local":
      return "dev-local";

    case undefined:
      return "release";

    default:
      util.assertNever(dev);
      throw util.CLIError("unknown dev mode"); // just to calm down TS type analyzer
  }
}

export function shouldDoAction(defaultValue: boolean, doFlag: boolean, noDoFlag: boolean): boolean {
  if (noDoFlag) {
    // Action was deliberately disabled by CLI flag or env variable
    return false;
  }
  if (doFlag) {
    // Action was deliberately enabled by CLI flag or env variable
    return true;
  }

  // Build docker images in CI by default
  // Do not build docker images automatically outside CI for now.
  return defaultValue;
}
