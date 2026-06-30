import { Command } from "commander";
import path from "node:path";
import type { createLocalS3Options } from "../../../../core";
import Core from "../../../../core";
import * as cmdOpts from "../../../../cmd-opts";
import * as util from "../../../../util";
import state from "../../../../state";
import * as platforma from "../../../../platforma";
import * as os from "node:os";
import { ArgParser } from "../arg-parser";

const optionGroups = (): Parameters<typeof cmdOpts.argDefs> => [
  cmdOpts.GlobalOptions(),
  cmdOpts.VersionOptions(),
  cmdOpts.S3AddressesOptions(),
  cmdOpts.AddressesOptions(),
  cmdOpts.PlBinaryOptions(),
  cmdOpts.PlSourcesOptions(),
  cmdOpts.ConfigOptions(),
  cmdOpts.LicenseOptions(),
  cmdOpts.StorageOptions(),
  cmdOpts.StoragePrimaryURLOptions(),
  cmdOpts.StorageWorkPathOptions(),
  cmdOpts.StorageLibraryURLOptions(),
  cmdOpts.PlLogFileOptions(),
  cmdOpts.PlWorkdirOptions(),
  cmdOpts.AuthOptions(),
];

export default function svcCreateLocalS3Command(): Command {
  const cmd = new Command("s3")
    .description(
      "Run Platforma Backend service as local process on current host (no docker container)",
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

    const logger = util.createLogger(flags["log-level"] || "info");
    const core = new Core(logger);
    core.mergeLicenseEnvs(flags);

    const workdir = flags["pl-workdir"] ?? ".";
    const storage = flags.storage
      ? path.join(workdir, flags.storage)
      : state.instanceDir(instanceName);
    const logFile = flags["pl-log-file"] ? path.join(workdir, flags["pl-log-file"]) : undefined;

    const authDrivers = core.initAuthDriversList(flags, workdir);
    const authEnabled = flags["auth-enabled"] ?? authDrivers !== undefined;

    let listenGrpc: string = "127.0.0.1:6345";
    if (flags["grpc-listen"]) listenGrpc = flags["grpc-listen"];
    else if (flags["grpc-port"]) listenGrpc = `127.0.0.1:${flags["grpc-port"]}`;

    let listenMon: string = "127.0.0.1:9090";
    if (flags["monitoring-listen"]) listenMon = flags["monitoring-listen"];
    else if (flags["monitoring-port"]) listenMon = `127.0.0.1:${flags["monitoring-port"]}`;

    let listenDbg: string = "127.0.0.1:9091";
    if (flags["debug-listen"]) listenDbg = flags["debug-listen"];
    else if (flags["debug-port"]) listenDbg = `127.0.0.1:${flags["debug-port"]}`;

    const createOptions: createLocalS3Options = {
      sourcesPath: flags["pl-sources"],
      binaryPath: flags["pl-binary"],

      version: flags.version,
      configPath: flags.config,
      workdir: flags["pl-workdir"],

      primaryURL: flags["storage-primary"],
      libraryURL: flags["storage-library"],

      minioPort: flags["s3-port"],
      minioConsolePort: flags["s3-console-port"],

      backendCommands: backendCommands,

      configOptions: {
        grpc: { listen: listenGrpc },
        monitoring: { listen: listenMon },
        debug: { listen: listenDbg },
        license: { value: flags["license"], file: flags["license-file"] },
        log: { path: logFile },
        localRoot: storage,
        core: { auth: { enabled: authEnabled, drivers: authDrivers } },
        storages: {
          work: { type: "FS", rootPath: flags["storage-work"] },
        },

        // Backend could consume a lot of CPU power,
        // we want to keep at least a couple for UI and other apps to work.
        numCpu: Math.max(os.cpus().length - 2, 1),
      },
    };

    logger.info(`Creating instance configuration, data directory and other stuff...`);
    core.createLocalS3(instanceName, createOptions);

    if (createOptions.binaryPath || createOptions.sourcesPath) {
      logger.info(`Instance '${instanceName}' was created. To start it run 'up' command`);
      return;
    }

    platforma
      .getBinary(logger, { version: flags.version })
      .then(() =>
        logger.info(`Instance '${instanceName}' was created. To start it run 'svc up' command`),
      )
      .catch(function (err: Error) {
        logger.error(err.message);
      });

    if (backendCommands.length > 0) {
      logger.info(`Unknown flags will be passed to backend: ${backendCommands.join(" ")}`);
    }
  });

  return cmd;
}
