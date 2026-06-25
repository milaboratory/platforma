import { Command } from "commander";
import * as cmdOpts from "../../core/cmd-opts";
import * as util from "../../core/util";
import { Core } from "../../core/core";

export function publishPackagesCommand(): Command {
  const cmd = new Command("packages").description(
    "publish software package archive to its registry",
  );

  cmdOpts.addOptions(
    cmd,
    cmdOpts.GlobalOptions(),
    cmdOpts.ForceOption(),
    cmdOpts.PlatformOptions(),

    cmdOpts.PackageIDOption(),
    cmdOpts.VersionOption(),

    cmdOpts.ArchiveOption(),
    cmdOpts.StorageURLOption(),
    cmdOpts.FailExistingPackagesOption(),
  );
  cmd.allowExcessArguments(); // oclif `static strict = false`

  cmd.action(async (opts: cmdOpts.AnyOptions) => {
    const flags = cmdOpts.toFlags(opts);
    const logger = util.createLogger(flags["log-level"]);

    const core = new Core(logger, { packageRoot: flags["package-root"] });
    core.pkgInfo.version = flags.version;
    core.targetPlatform = flags.platform as util.PlatformType;
    core.allPlatforms = flags["all-platforms"];

    await core.publishPackages({
      ids: flags["package-id"],

      archivePath: flags.archive,
      storageURL: flags["storage-url"],

      failExisting: flags["fail-existing-packages"],
      forceReupload: flags.force,
    });
  });

  return cmd;
}
