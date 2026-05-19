import { Command } from "@oclif/core";
import * as cmdOpts from "../../core/cmd-opts";
import * as util from "../../core/util";
import { Core } from "../../core/core";
import * as envs from "../../core/envs";
import * as docker from "../../core/docker";
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

      // In dev-local mode, default to building + pushing docker images to the
      // shared dev ECR. CI keeps its existing default. Explicit --docker-build
      // / --docker-no-build still wins either way.
      const buildDocker = cmdOpts.shouldDoAction(
        envs.isCI() || isDevLocal,
        flags["docker-build"],
        flags["docker-no-build"],
      );

      // Fallback to the dev ECR when no --docker-registry is supplied in dev mode.
      const dockerRegistry =
        flags["docker-registry"] ?? (isDevLocal ? defaults.DEV_DOCKER_REGISTRY : undefined);

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

      const autopush = cmdOpts.shouldDoAction(
        (envs.isCI() && !core.pkgInfo.isPrivate) || isDevLocal,
        flags["docker-autopush"],
        flags["docker-no-autopush"],
      );
      if (buildDocker && autopush) {
        // TODO: as we do not create content-addressable archives for binary packages, we should not upload them
        //       for each build to not spoil release process with dev archives cached by CDN.
        //       once we support content-addressable archives, we can publish everything here (not just docker).

        // Auto-authenticate to ECR in dev-local mode. CI is expected to manage
        // its own docker login step in the workflow.
        if (isDevLocal && dockerRegistry) {
          docker.loginToECR(flags["docker-push-to"] ?? dockerRegistry);
        }

        core.publishDockerImages({
          ids: flags["package-id"],
          pushTo: flags["docker-push-to"],
          strictPlatformMatching: envs.isCI(),
        });
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
