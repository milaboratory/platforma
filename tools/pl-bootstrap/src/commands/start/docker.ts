import path from "node:path";

import { Command } from "commander";
import Core from "../../core";
import * as cmdOpts from "../../cmd-opts";
import * as util from "../../util";
import type * as types from "../../templates/types";
import state from "../../state";

export default function startDockerCommand(): Command {
  const cmd = new Command("docker").description(
    "Run platforma backend service with 'FS' primary storage type",
  );

  cmdOpts.addOptions(
    cmd,
    cmdOpts.GlobalOptions(),
    cmdOpts.AddressesOptions(),
    cmdOpts.ImageOptions(),
    cmdOpts.VersionOptions(),
    cmdOpts.ArchOptions(),
    cmdOpts.AuthOptions(),
    cmdOpts.LicenseOptions(),
    cmdOpts.MountOptions(),
    cmdOpts.StorageOptions(),
    cmdOpts.StoragePrimaryURLOptions(),
    cmdOpts.StorageWorkPathOptions(),
    cmdOpts.StorageLibraryURLOptions(),
  );

  cmd.action(async (o) => {
    const flags = cmdOpts.toFlags(o);

    const logger = util.createLogger(flags["log-level"]);
    const core = new Core(logger);
    core.mergeLicenseEnvs(flags);

    const instanceName = "docker";

    const authEnabled = flags["auth-enabled"];
    const authOptions: types.authOptions | undefined = authEnabled
      ? {
          enabled: authEnabled,
          drivers: core.initAuthDriversList(flags, "."),
        }
      : undefined;
    const storage = flags.storage ? path.join(".", flags.storage) : state.instanceDir(instanceName);

    const mounts: { hostPath: string; containerPath?: string }[] = [];
    for (const p of flags.mount ?? []) {
      mounts.push({ hostPath: p });
    }

    const platformOverride = flags.arch ? `linux/${flags.arch}` : undefined;

    const instance = core.createDocker(instanceName, storage, {
      primaryStorageURL: flags["storage-primary"],
      workStoragePath: flags["storage-work"],
      libraryStorageURL: flags["storage-library"],

      image: flags.image,
      version: flags.version,

      platformOverride: platformOverride,
      customMounts: mounts,

      license: flags["license"],
      licenseFile: flags["license-file"],

      auth: authOptions,

      grpcAddr: flags["grpc-listen"],
      grpcPort: flags["grpc-port"],

      monitoringAddr: flags["monitoring-listen"],
      monitoringPort: flags["monitoring-port"],

      debugAddr: flags["debug-listen"],
      debugPort: flags["debug-port"],
    });

    core.switchInstance(instance);
  });

  return cmd;
}
