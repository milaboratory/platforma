import { Command } from "commander";
import * as cmdOpts from "../../cmd-opts";
import { util, createBuilder } from "@platforma-sdk/package-builder-lib";

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
  });

  return cmd;
}
