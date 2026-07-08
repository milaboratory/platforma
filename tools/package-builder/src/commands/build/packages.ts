import { Command } from "commander";
import * as cmdOpts from "../../cmd-opts";
import { util, createBuilder } from "@platforma-sdk/package-builder-lib";

export function buildPackagesCommand(): Command {
  const cmd = new Command("packages").description(
    "Pack software into platforma package (.tgz archive for binary registry)",
  );

  cmdOpts.addOptions(
    cmd,
    cmdOpts.GlobalOptions(),
    cmdOpts.BuildOptions(),
    cmdOpts.PlatformOptions(),
    cmdOpts.DockerOptions(),
    cmdOpts.CondaOptions(),

    cmdOpts.VersionOption(),
    cmdOpts.ArchiveOption(),
    cmdOpts.ContentRootOption(),
    cmdOpts.PackageIDOption(),
    cmdOpts.DirHashOption(),
  );

  cmd.action(async (opts: cmdOpts.AnyOptions) => {
    const flags = cmdOpts.toFlags(opts);
    const logger = util.createLogger(flags["log-level"]);

    const core = createBuilder(logger, { packageRoot: flags["package-root"] });

    core.version = flags.version;
    core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName);
    core.targetPlatform = flags.platform as util.PlatformType;
    core.allPlatforms = flags["all-platforms"];
    core.fullDirHash = flags["full-dir-hash"];

    await core.buildSoftwareArchives({
      ids: flags["package-id"],
      forceBuild: flags.force as boolean,

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
  });

  return cmd;
}
