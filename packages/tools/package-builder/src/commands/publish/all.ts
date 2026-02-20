import { Command } from "@oclif/core";
import * as cmdOpts from "../../core/cmd-opts";
import * as util from "../../core/util";
import { Core } from "../../core/core";
import * as envs from "../../core/envs";

export default class PublishAll extends Command {
  static override description = "publish entrypoint descriptors AND software package archive";

  static override examples = ["<%= config.bin %> <%= command.id %>"];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.ForceFlag,
    ...cmdOpts.PlatformFlags,
    ...cmdOpts.VersionFlag,

    ...cmdOpts.ArchiveFlag,
    ...cmdOpts.StorageURLFlag,
    ["docker-push-to"]: cmdOpts.DockerFlags["docker-push-to"],

    ...cmdOpts.PackageIDFlag,
    ...cmdOpts.FailExistingPackagesFlag,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(PublishAll);
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

    core.publishDockerImages({
      ids: flags["package-id"],
      pushTo: flags["docker-push-to"],
      strictPlatformMatching: envs.isCI(),
    });
  }
}
