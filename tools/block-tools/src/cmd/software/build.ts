import { Command, Option } from "commander";
import { util, envs, defaults, createBuilder } from "@platforma-sdk/package-builder-lib";
import { resolvePlan, channels, variants, locations, type Knobs } from "./knobs";

// The three knobs reach the command as env vars (set by the block's build:<scenario>
// scripts) or as the mirroring flags below. PL_BUILD_USE_PUBLISHED selects build-against-existing.
const PL_BUILD_CHANNEL = "PL_BUILD_CHANNEL";
const PL_BUILD_VARIANT = "PL_BUILD_VARIANT";
const PL_BUILD_LOCATION = "PL_BUILD_LOCATION";
const PL_BUILD_USE_PUBLISHED = "PL_BUILD_USE_PUBLISHED";

function collect(value: string, previous?: string[]): string[] {
  return previous ? [...previous, value] : [value];
}

// `software build` — does the whole make-it-runnable-at-the-target action for one
// software module in one pass: build the artifact, push it when the target is remote,
// then write the per-target `.sw.json` descriptor LAST (ready ⟺ the descriptor exists).
// With no knobs it reproduces `pl-pkg build` (release, version-derived, push only in CI).
export function softwareBuildCommand(): Command {
  const cmd = new Command("build").description(
    "Build a software module for a target and write its .sw.json descriptor (build + push in one pass)",
  );

  // The three target knobs (env-backed; flag wins on conflict).
  cmd.addOption(
    new Option("--channel <channel>", "registry channel to build for")
      .choices([...channels])
      .env(PL_BUILD_CHANNEL),
  );
  cmd.addOption(
    new Option("--variant <variant>", "artifact kind to build (default: per entrypoint)")
      .choices([...variants])
      .env(PL_BUILD_VARIANT),
  );
  cmd.addOption(
    new Option("--location <location>", "where the artifact lands (local = no push)")
      .choices([...locations])
      .env(PL_BUILD_LOCATION),
  );
  cmd.addOption(
    new Option(
      "--use-published",
      "do not build or push; emit a descriptor pointing at the already-published release artifact",
    ).env(PL_BUILD_USE_PUBLISHED),
  );

  // Pass-through build options, mirroring `pl-pkg build` so this is a drop-in replacement.
  cmd.addOption(
    new Option("--log-level <level>", "logging level")
      .choices(["error", "warn", "info", "debug"])
      .default("info"),
  );
  cmd.addOption(new Option("--package-root <path>", "path to directory with package.json file"));
  cmd.addOption(
    new Option("--force", "force action, ignoring automatic safety checks").default(false),
  );
  cmd.addOption(new Option("--version <value>", "override package version (ignore package.json)"));
  cmd.addOption(
    new Option("--platform <os-arch>", "{os}-{arch} pair; no effect on cross-platform packages")
      .choices([...util.AllPlatforms])
      .env(envs.PL_PKG_OS),
  );
  cmd.addOption(new Option("--all-platforms", "build for all supported platforms").default(false));
  cmd.addOption(
    new Option("--full-dir-hash", "hash file contents (not metadata) for the dev content hash")
      .env(envs.PL_PKG_FULL_HASH)
      .default(false),
  );
  cmd.addOption(
    new Option("--package-id <id>", "act only on selected packages").argParser(collect),
  );
  cmd.addOption(
    new Option("--content-root <path>", "override software content root").env(
      envs.PL_PKG_CONTENT_ROOT,
    ),
  );
  cmd.addOption(
    new Option("--storage-url <url>", "override binary upload registry URL").env(
      envs.PL_PKG_STORAGE_URL,
    ),
  );
  cmd.addOption(
    new Option(
      "--docker-registry <registry>",
      "docker pull registry embedded in the descriptor",
    ).env(envs.PL_DOCKER_REGISTRY),
  );
  cmd.addOption(
    new Option("--docker-push-to <registry>", "alternative registry for docker push").env(
      envs.PL_DOCKER_REGISTRY_PUSH_TO,
    ),
  );
  cmd.addOption(
    new Option("--docker-build", "build docker images").env(envs.PL_DOCKER_BUILD).default(false),
  );
  cmd.addOption(
    new Option("--docker-no-build", "do not build docker images")
      .env(envs.PL_DOCKER_NO_BUILD)
      .default(false),
  );
  cmd.addOption(
    new Option("--docker-autopush", "push docker images after build")
      .env(envs.PL_DOCKER_AUTOPUSH)
      .default(false),
  );
  cmd.addOption(
    new Option("--docker-no-autopush", "do not push docker images")
      .env(envs.PL_DOCKER_NO_AUTOPUSH)
      .default(false),
  );
  cmd.addOption(
    new Option("--conda-build", "build conda environment before packing")
      .env(envs.PL_CONDA_BUILD)
      .default(false),
  );
  cmd.addOption(
    new Option("--conda-no-build", "do not build conda environment")
      .env(envs.PL_CONDA_NO_BUILD)
      .default(false),
  );

  cmd.action(async (o) => {
    const logger = util.createLogger(o.logLevel);

    try {
      const knobs: Knobs = {
        channel: o.channel,
        variant: o.variant,
        location: o.location,
        usePublished: Boolean(o.usePublished),
      };
      const plan = resolvePlan(knobs);

      const core = createBuilder(logger, { packageRoot: o.packageRoot });
      core.buildMode = plan.buildMode;
      core.version = o.version;
      core.targetPlatform = o.platform as util.PlatformType;
      core.allPlatforms = Boolean(o.allPlatforms);
      core.fullDirHash = Boolean(o.fullDirHash);

      const ids: string[] | undefined = o.packageId;
      const isDev = (o.channel ?? "release") === "dev";

      // Docker build/push: when location is unset (legacy parity) defer to the CI default
      // via the same opt-in/out flags pl-pkg uses; otherwise the variant/location decide.
      const buildDocker = plan.isCIDefaultPush
        ? shouldDoAction(envs.isCI(), o.dockerBuild, o.dockerNoBuild)
        : plan.buildDocker;
      const pushDocker = plan.isCIDefaultPush
        ? buildDocker &&
          shouldDoAction(envs.isCI() && !core.isPrivate, o.dockerAutopush, o.dockerNoAutopush)
        : plan.pushDocker;

      const dockerRegistry =
        o.dockerRegistry ?? (isDev && buildDocker ? defaults.DEV_DOCKER_REGISTRY : undefined);

      // 1. BUILD (descriptor not written yet).
      if (buildDocker) {
        core.buildDockerImages({
          ids,
          registry: dockerRegistry,
          strictPlatformMatching: envs.isCI(),
        });
      }
      if (plan.usePublished) {
        core.writePublishedArtifactInfo({ ids });
      } else if (plan.buildBinary) {
        await core.buildSoftwareArchives({
          ids,
          forceBuild: Boolean(o.force),
          contentRoot: o.contentRoot,
          skipIfEmpty: ids ? false : true,
          condaBuild: shouldDoAction(true, o.condaBuild, o.condaNoBuild),
        });
      }

      // 2. PUSH when the target is remote (still no descriptor on disk).
      if (pushDocker) {
        core.publishDockerImages({
          ids,
          pushTo: o.dockerPushTo,
          strictPlatformMatching: envs.isCI(),
        });
      }
      if (plan.uploadBinary) {
        // storageURL falls through to the engine, which resolves the dev/release endpoint.
        await core.publishPackages({ ids, storageURL: o.storageUrl });
      }

      // 3. DESCRIPTOR LAST — only after build + push have succeeded (A-0013).
      core.buildSwJsonFiles({ packageIds: ids });
    } catch (e) {
      logger.debug(e);
      if (e instanceof Error) logger.debug(e.stack);
      throw e;
    }
  });

  return cmd;
}

// Mirrors pl-pkg's shouldDoAction: explicit no-flag wins, then explicit yes-flag, else default.
function shouldDoAction(defaultValue: boolean, doFlag: boolean, noDoFlag: boolean): boolean {
  if (noDoFlag) return false;
  if (doFlag) return true;
  return defaultValue;
}
