import { Command } from "commander";
import * as cmdOpts from "../../cmd-opts";
import { util, envs, defaults, createBuilder } from "@platforma-sdk/package-builder-lib";

// Registered twice: as the top-level `build` command and as the `build all`
// subcommand. Both run the same build-all action with the same flags.
export function buildAllCommand(name = "build"): Command {
  const cmd = new Command(name).description(
    "Build all targets (entrypoint descriptors, binary pacakges and so on)",
  );

  cmdOpts.addOptions(
    cmd,
    cmdOpts.GlobalOptions(),
    cmdOpts.ForceOption(),

    cmdOpts.BuildOptions(),
    cmdOpts.PlatformOptions(),
    cmdOpts.VersionOption(),
    cmdOpts.DockerOptions(),
    cmdOpts.CondaOptions(),

    cmdOpts.EntrypointNameOption(),
    cmdOpts.PackageIDOption(),
    cmdOpts.DirHashOption(),

    cmdOpts.ArchiveOption(),
    cmdOpts.ContentRootOption(),
  );

  cmd.action(async (opts: cmdOpts.AnyOptions) => {
    const flags = cmdOpts.toFlags(opts);
    const logger = util.createLogger(flags["log-level"]);

    try {
      const core = createBuilder(logger, { packageRoot: flags["package-root"] });

      core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName);
      core.version = flags.version;
      core.targetPlatform = flags.platform as util.PlatformType;
      core.allPlatforms = flags["all-platforms"];
      core.fullDirHash = flags["full-dir-hash"];

      const isDevLocal = core.buildMode === "dev-local";

      // Docker build defaults to OFF outside CI — including dev-local. Block
      // developers run 'pnpm run build:dev' on every save and do not want a
      // slow cross-compile + push on each iteration. To publish dev images,
      // they invoke a separate script (template ships 'build:dev-remote')
      // that sets PL_DOCKER_BUILD=1 + PL_DOCKER_AUTOPUSH=1.
      const buildDocker = cmdOpts.shouldDoAction({
        default: envs.isCI(),
        enable: flags["docker-build"],
        disable: flags["docker-no-build"],
      });

      // When dev-local explicitly opts into a docker build (--docker-build /
      // PL_DOCKER_BUILD=1) and no --docker-registry is set, fall back to the
      // shared dev ECR.
      const dockerRegistry =
        flags["docker-registry"] ??
        (isDevLocal && buildDocker ? defaults.DEV_DOCKER_REGISTRY : undefined);

      if (buildDocker) {
        core.buildDockerImages({
          ids: flags["package-id"],
          registry: dockerRegistry,
          strictPlatformMatching: envs.isCI(),
        });
      }

      await core.buildSoftwareArchives({
        ids: flags["package-id"],
        forceBuild: flags.force,

        archivePath: flags.archive,
        contentRoot: flags["content-root"],
        skipIfEmpty: flags["package-id"] ? false : true, // do not skip 'non-binary' packages if their IDs were set as args

        // Automated builds settings
        condaBuild: cmdOpts.shouldDoAction({
          default: true,
          enable: flags["conda-build"],
          disable: flags["conda-no-build"],
        }),
      });

      core.buildSwJsonFiles({
        packageIds: flags["package-id"] ? flags["package-id"] : undefined,
      });

      // Auto-push defaults to OFF outside CI. Dev iteration doesn't push;
      // explicit opt-in via --docker-autopush / PL_DOCKER_AUTOPUSH=1 (which
      // 'build:dev-remote' sets) flips it. Private packages never push by
      // default — the dev ECR is public.
      const autopush = cmdOpts.shouldDoAction({
        default: envs.isCI() && !core.isPrivate,
        enable: flags["docker-autopush"],
        disable: flags["docker-no-autopush"],
      });
      if (buildDocker && autopush) {
        // TODO: as we do not create content-addressable archives for binary packages, we should not upload them
        //       for each build to not spoil release process with dev archives cached by CDN.
        //       once we support content-addressable archives, we can publish everything here (not just docker).

        // The user is expected to have already 'docker login'-ed to the target
        // registry (CI workflows handle their own login step). If push fails
        // because of auth, docker.push surfaces a self-explanatory error.
        core.publishDockerImages({
          ids: flags["package-id"],
          pushTo: flags["docker-push-to"],
          strictPlatformMatching: envs.isCI(),
        });

        const effectiveRegistry = flags["docker-push-to"] ?? dockerRegistry;
        if (effectiveRegistry?.startsWith("public.ecr.aws/")) {
          const galleryUrl =
            "https://" + effectiveRegistry.replace(/^public\.ecr\.aws/, "gallery.ecr.aws");
          logger.info("===============");
          logger.info(`Public ECR repository: ${galleryUrl}`);
          logger.info("===============");
        }
      }
    } catch (e) {
      logger.debug(e);
      if (e instanceof Error) {
        logger.debug(e.stack);
      }

      throw e;
    }
  });

  return cmd;
}
