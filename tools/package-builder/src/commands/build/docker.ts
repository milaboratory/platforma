import { Command } from "commander";
import * as cmdOpts from "../../cmd-opts";
import {
  util,
  envs,
  createBuilder,
  assertDockerPushIntent,
} from "@platforma-sdk/package-builder-lib";

export function buildDockerCommand(): Command {
  const cmd = new Command("docker").description("build docker images");

  cmdOpts.addOptions(
    cmd,
    cmdOpts.GlobalOptions(),
    cmdOpts.BuildOptions(),
    cmdOpts.VersionOption(),
    cmdOpts.PackageIDOption(),
    cmdOpts.DockerOptions(),
  );

  cmd.action(async (opts: cmdOpts.AnyOptions) => {
    const flags = cmdOpts.toFlags(opts);
    const logger = util.createLogger(flags["log-level"]);

    const core = createBuilder(logger, { packageRoot: flags["package-root"] });
    core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName);

    core.version = flags.version;

    const autopush = cmdOpts.shouldDoAction({
      default: envs.isCI() && !core.isPrivate, // do not push docker images of private packages
      enable: flags["docker-autopush"],
      disable: flags["docker-no-autopush"],
    });

    // Before the build, not after: a CI run that would discard its images should
    // not spend minutes cross-compiling them first.
    assertDockerPushIntent({
      buildDocker: true,
      pushDocker: autopush,
      pushDisabledExplicitly: flags["docker-no-autopush"],
      dockerPackageCount: core.selectedDockerPackages(flags["package-id"]).length,
    });

    core.buildDockerImages({
      ids: flags["package-id"],
      strictPlatformMatching: envs.isCI(),
    });

    // No extra !isPrivate check here: it is already in the default above, and
    // repeating it made the documented --docker-autopush opt-in a silent no-op.
    if (autopush) {
      core.publishDockerImages({
        ids: flags["package-id"],
        strictPlatformMatching: envs.isCI(),
      });
    }

    core.buildSwJsonFiles({
      packageIds: flags["package-id"] ? flags["package-id"] : undefined,
    });
  });

  return cmd;
}
