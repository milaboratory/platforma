import { Command } from "commander";
import * as cmdOpts from "../core/cmd-opts";
import * as util from "../core/util";
import { Core } from "../core/core";
import * as envs from "../core/envs";

export function prepublishCommand(): Command {
  const cmd = new Command("prepublish").description(
    "build *.sw.json files and do other preparations for publishing",
  );

  cmdOpts.addOptions(
    cmd,
    cmdOpts.GlobalOptions(),
    cmdOpts.ForceOption(),

    cmdOpts.DirHashOption(),
    cmdOpts.VersionOption(),

    cmdOpts.StorageURLOption(),
    cmdOpts.FailExistingPackagesOption(),
  );

  cmd.action(async (opts: cmdOpts.AnyOptions) => {
    const flags = cmdOpts.toFlags(opts);
    const logger = util.createLogger(flags["log-level"]);

    const core = new Core(logger, { packageRoot: flags["package-root"] });
    core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName);
    core.pkgInfo.version = flags.version;
    core.fullDirHash = flags["full-dir-hash"];
    core.allPlatforms = true;

    core.buildSwJsonFiles({
      requireAllArtifacts: true,
    });

    await core.publishPackages({
      forceReupload: flags.force,
      failExisting: flags["fail-existing-packages"],

      storageURL: flags["storage-url"],
    });

    core.publishDockerImages({ strictPlatformMatching: envs.isCI() });
  });

  return cmd;
}
