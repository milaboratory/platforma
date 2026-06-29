import { Command } from "commander";
import path from "node:path";
import type * as types from "../../../../templates/types";
import Core from "../../../../core";
import * as cmdOpts from "../../../../cmd-opts";
import * as util from "../../../../util";
import state from "../../../../state";
import { ArgParser } from "../arg-parser";

const optionGroups = (): Parameters<typeof cmdOpts.argDefs> => [
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
];

export default function svcCreateDockerS3Command(): Command {
  const cmd = new Command("s3")
    .description(
      "Run Platforma Backend service as docker container on current host with MinIO as local S3 storage",
    )
    .allowUnknownOption()
    .allowExcessArguments();

  // Unknown flags are forwarded to the backend, so parse the raw token list
  // ourselves instead of letting commander reject them.
  cmd.argument("[args...]", "instance name followed by optional backend flags");

  cmd.action(async () => {
    const args = cmd.args;
    const parser = new ArgParser(cmdOpts.argDefs(...optionGroups()));
    const parsed = parser.parse(args);

    const errors = parser.validateRequired(parsed.knownFlags);
    if (errors.length > 0) {
      throw new Error(`Validation errors:\n${errors.join("\n")}`);
    }

    const instanceName = parsed.instanceName;
    const flags = parsed.knownFlags;

    const backendCommands = parsed.unknownFlags;
    if (flags["log-level"]) {
      backendCommands.push(`--log-level=${flags["log-level"]}`);
    }

    if (!flags["s3-port"]) flags["s3-port"] = 9000;
    if (!flags["s3-console-port"]) flags["s3-console-port"] = 9001;

    const logger = util.createLogger(flags["log-level"] || "info");
    const core = new Core(logger);
    core.mergeLicenseEnvs(flags);

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

    core.createDockerS3(instanceName, storage, {
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

      backendCommands: backendCommands,
    });

    logger.info(`Instance '${instanceName}' was created. To start it run 'up' command`);
    if (flags["minio-presign-host"]) {
      logger.info(
        "  NOTE: make sure you have 'minio' host in your hosts file as 127.0.0.1 address",
      );
    }

    if (backendCommands.length > 0) {
      logger.info(`Unknown flags will be passed to backend: ${backendCommands.join(" ")}`);
    }
  });

  return cmd;
}
