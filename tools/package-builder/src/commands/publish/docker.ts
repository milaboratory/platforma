import { Command } from "commander";
import * as cmdOpts from "../../cmd-opts";
import { util, envs, createBuilder } from "@platforma-sdk/package-builder-lib";

export function publishDockerCommand(): Command {
  const cmd = new Command("docker").description("publish docker image to its registry");

  cmdOpts.addOptions(
    cmd,
    cmdOpts.GlobalOptions(),
    cmdOpts.ForceOption(),

    cmdOpts.PackageIDOption(),
    cmdOpts.VersionOption(),
    [cmdOpts.DockerPushToOption()],

    cmdOpts.FailExistingPackagesOption(),
  );
  cmd.allowExcessArguments(); // oclif `static strict = false`

  cmd.action(async (opts: cmdOpts.AnyOptions) => {
    const flags = cmdOpts.toFlags(opts);
    const logger = util.createLogger(flags["log-level"]);

    const core = createBuilder(logger, { packageRoot: flags["package-root"] });
    core.version = flags.version;

    core.publishDockerImages({
      ids: flags["package-id"],
      pushTo: flags["docker-push-to"],
      strictPlatformMatching: envs.isCI(),
    });
  });

  return cmd;
}
