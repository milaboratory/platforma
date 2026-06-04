import { Command } from "@oclif/core";
import * as cmdOpts from "../../core/cmd-opts";
import * as util from "../../core/util";
import { Core } from "../../core/core";
import * as envs from "../../core/envs";
import * as defaults from "../../defaults";

export default class BuildAll extends Command {
  static override description =
    "Build all targets (entrypoint descriptors, binary pacakges and so on)";

  static override examples = ["<%= config.bin %> <%= command.id %>"];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.ForceFlag,

    ...cmdOpts.BuildFlags,
    ...cmdOpts.PlatformFlags,
    ...cmdOpts.VersionFlag,
    ...cmdOpts.DockerFlags,
    ...cmdOpts.CondaFlags,

    ...cmdOpts.EntrypointNameFlag,
    ...cmdOpts.PackageIDFlag,
    ...cmdOpts.DirHashFlag,

    ...cmdOpts.ArchiveFlag,
    ...cmdOpts.ContentRootFlag,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(BuildAll);
    const logger = util.createLogger(flags["log-level"]);

    try {
      const core = new Core(logger, { packageRoot: flags["package-root"] });

      core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName);
      core.pkgInfo.version = flags.version;
      core.targetPlatform = flags.platform as util.PlatformType;
      core.allPlatforms = flags["all-platforms"];
      core.fullDirHash = flags["full-dir-hash"];

      const isDevLocal = core.buildMode === "dev-local";

      // Docker build defaults to OFF outside CI — including dev-local. Block
      // developers run 'pnpm run build:dev' on every save and do not want a
      // slow cross-compile + push on each iteration. To publish dev images,
      // they invoke a separate script (template ships 'build:docker-dev')
      // that sets PL_DOCKER_BUILD=1 + PL_DOCKER_AUTOPUSH=1.
      const buildDocker = cmdOpts.shouldDoAction(
        envs.isCI(),
        flags["docker-build"],
        flags["docker-no-build"],
      );

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
        condaBuild: cmdOpts.shouldDoAction(true, flags["conda-build"], flags["conda-no-build"]),
      });

      core.buildSwJsonFiles({
        packageIds: flags["package-id"] ? flags["package-id"] : undefined,
      });

      // Auto-push defaults to OFF outside CI. Dev iteration doesn't push;
      // explicit opt-in via --docker-autopush / PL_DOCKER_AUTOPUSH=1 (which
      // 'build:docker-dev' sets) flips it. Private packages never push by
      // default — the dev ECR is public.
      const autopush = cmdOpts.shouldDoAction(
        envs.isCI() && !core.pkgInfo.isPrivate,
        flags["docker-autopush"],
        flags["docker-no-autopush"],
      );
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

        // For public ECR pushes, surface the human-readable Gallery URL so a
        // developer can open the browser and confirm their image landed. The
        // effective push destination is --docker-push-to if set, otherwise
        // the --docker-registry / DEV_DOCKER_REGISTRY chain.
        const effectiveRegistry = flags["docker-push-to"] ?? dockerRegistry;
        if (effectiveRegistry?.startsWith("public.ecr.aws/")) {
          const galleryUrl =
            "https://" + effectiveRegistry.replace(/^public\.ecr\.aws/, "gallery.ecr.aws");
          logger.info("================");
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
  }
}
