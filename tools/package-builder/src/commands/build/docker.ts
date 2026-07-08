import { Command } from "commander";
import * as cmdOpts from "../../cmd-opts";
import { util, envs, createBuilder } from "@platforma-sdk/package-builder-lib";

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

    core.buildDockerImages({
      ids: flags["package-id"],
      strictPlatformMatching: envs.isCI(),
    });

    const autopush = cmdOpts.shouldDoAction({
      default: envs.isCI() && !core.isPrivate, // do not push docker images of private packages
      enable: flags["docker-autopush"],
      disable: flags["docker-no-autopush"],
    });
    if (autopush && !core.isPrivate) {
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
