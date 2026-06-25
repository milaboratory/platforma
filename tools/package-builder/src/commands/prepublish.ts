import { Command } from "commander";
import * as cmdOpts from "../cmd-opts";
import { util, envs, createBuilder } from "@platforma-sdk/package-builder-lib";

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

    const core = createBuilder(logger, { packageRoot: flags["package-root"] });
    core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName);
    core.version = flags.version;
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
