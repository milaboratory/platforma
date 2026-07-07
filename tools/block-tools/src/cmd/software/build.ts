import { Command, Option } from "commander";
import { util, envs, createBuilder } from "@platforma-sdk/package-builder-lib";
import { parseScenario, channels, variants, locations } from "./knobs";
import { runBuild } from "./run-build";
import {
  PL_BUILD_CHANNEL,
  PL_BUILD_VARIANT,
  PL_BUILD_LOCATION,
  PL_BUILD_USE_PUBLISHED,
} from "./env";

// Build a software module in one pass — build, push when remote, then write the descriptor
// last. With no knobs it reproduces `pl-pkg build`.
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
    new Option("--variant <variant>", "artifact kind to build (default: all declared)")
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
  cmd.addOption(new Option("--package-id <id...>", "act only on selected packages"));
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
      const scenario = parseScenario({
        channel: o.channel,
        variant: o.variant,
        location: o.location,
        usePublished: Boolean(o.usePublished),
      });

      const core = createBuilder(logger, { packageRoot: o.packageRoot });
      core.version = o.version;
      core.targetPlatform = o.platform as util.PlatformType;
      core.allPlatforms = Boolean(o.allPlatforms);
      core.fullDirHash = Boolean(o.fullDirHash);

      // Collapse the pl-pkg-parity --{docker,conda}-{,no-}* flag pairs to decisions here, at the CLI
      // boundary, so runBuild receives resolved booleans (docker defaults to on in CI, push unless private).
      const buildDocker = util.shouldDoAction({
        default: envs.isCI(),
        enable: o.dockerBuild,
        disable: o.dockerNoBuild,
      });
      const pushDocker =
        buildDocker &&
        util.shouldDoAction({
          default: envs.isCI() && !core.isPrivate,
          enable: o.dockerAutopush,
          disable: o.dockerNoAutopush,
        });

      await runBuild({
        core,
        scenario,
        logger,
        options: {
          ids: o.packageId,
          force: o.force,
          contentRoot: o.contentRoot,
          storageUrl: o.storageUrl,
          dockerRegistry: o.dockerRegistry,
          dockerPushTo: o.dockerPushTo,
          buildDocker,
          pushDocker,
          condaBuild: util.shouldDoAction({
            default: true,
            enable: o.condaBuild,
            disable: o.condaNoBuild,
          }),
        },
      });
    } catch (e) {
      logger.debug(e);
      if (e instanceof Error) logger.debug(e.stack);
      throw e;
    }
  });

  return cmd;
}
