import path from "node:path";

import { Command } from "commander";
import Core from "../../../core";
import * as cmdOpts from "../../../cmd-opts";
import * as util from "../../../util";
import type * as types from "../../../templates/types";
import state from "../../../state";

export default function startDockerS3Command(): Command {
  const cmd = new Command("s3").description(
    "Run platforma backend service with 'S3' primary storage type",
  );

  cmdOpts.addOptions(
    cmd,
    cmdOpts.GlobalOptions(),
    cmdOpts.AddressesOptions(),
    cmdOpts.S3AddressesOptions(),
    cmdOpts.ImageOptions(),
    cmdOpts.VersionOptions(),
    cmdOpts.ArchOptions(),
    cmdOpts.AuthOptions(),
    cmdOpts.LicenseOptions(),
    cmdOpts.MountOptions(),
    cmdOpts.StorageOptions(),
    cmdOpts.MinioPresignHostOptions(),
  );

  cmd.action(async (o) => {
    const flags = cmdOpts.toFlags(o);

    const logger = util.createLogger(flags["log-level"]);
    const core = new Core(logger);
    core.mergeLicenseEnvs(flags);

    const instanceName = "docker-s3";

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
    const presignHost = flags["minio-presign-host"] ? "minio" : "localhost";

    const instance = core.createDockerS3(instanceName, storage, {
      image: flags.image,
      version: flags.version,

      license: flags["license"],
      licenseFile: flags["license-file"],

      platformOverride: platformOverride,
      customMounts: mounts,

      auth: authOptions,

      grpcAddr: flags["grpc-listen"],
      grpcPort: flags["grpc-port"],

      monitoringAddr: flags["monitoring-listen"],
      monitoringPort: flags["monitoring-port"],

      debugAddr: flags["debug-listen"],
      debugPort: flags["debug-port"],

      s3Port: flags["s3-port"],
      s3ConsolePort: flags["s3-console-port"],

      presignHost: presignHost,
    });

    core.switchInstance(instance);
  });

  return cmd;
}
