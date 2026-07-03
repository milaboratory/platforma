import { Command } from "commander";
import * as cmdOpts from "../../cmd-opts";
import { util, envs, createBuilder } from "@platforma-sdk/package-builder-lib";

export function publishAllCommand(): Command {
  const cmd = new Command("all").description(
    "publish entrypoint descriptors AND software package archive",
  );

  cmdOpts.addOptions(
    cmd,
    cmdOpts.GlobalOptions(),
    cmdOpts.ForceOption(),
    cmdOpts.PlatformOptions(),
    cmdOpts.VersionOption(),

    cmdOpts.ArchiveOption(),
    cmdOpts.StorageURLOption(),
    [cmdOpts.DockerPushToOption()],

    cmdOpts.PackageIDOption(),
    cmdOpts.FailExistingPackagesOption(),
  );

  cmd.action(async (opts: cmdOpts.AnyOptions) => {
    const flags = cmdOpts.toFlags(opts);
    const logger = util.createLogger(flags["log-level"]);

    const core = createBuilder(logger, { packageRoot: flags["package-root"] });
    core.version = flags.version;
    core.targetPlatform = flags.platform as util.PlatformType;
    core.allPlatforms = flags["all-platforms"];

    await core.publishPackages({
      ids: flags["package-id"],

      archivePath: flags.archive,
      storageURL: flags["storage-url"],

      failExisting: flags["fail-existing-packages"],
      forceReupload: flags.force,
    });

    core.publishDockerImages({
      ids: flags["package-id"],
      pushTo: flags["docker-push-to"],
      strictPlatformMatching: envs.isCI(),
    });
  });

  return cmd;
}
