import path from "node:path";

import { Command } from "commander";
import type { createLocalS3Options } from "../../../core";
import Core from "../../../core";
import * as cmdOpts from "../../../cmd-opts";
import * as platforma from "../../../platforma";
import * as util from "../../../util";
import state from "../../../state";
import * as os from "node:os";

export default function startLocalS3Command(): Command {
  const cmd = new Command("s3").description(
    "Run Platforma Backend service as local process on current host (no docker container)",
  );

  cmdOpts.addOptions(
    cmd,
    cmdOpts.GlobalOptions(),
    cmdOpts.VersionOptions(),
    cmdOpts.AddressesOptions(),
    cmdOpts.S3AddressesOptions(),
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
  );

  cmd.action(async (o) => {
    const flags = cmdOpts.toFlags(o);

    const logger = util.createLogger(flags["log-level"]);
    const core = new Core(logger);
    core.mergeLicenseEnvs(flags);

    const instanceName = "local-s3";

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

    const startOptions: createLocalS3Options = {
      sourcesPath: flags["pl-sources"],
      binaryPath: flags["pl-binary"],

      version: flags.version,
      configPath: flags.config,
      workdir: flags["pl-workdir"],

      primaryURL: flags["storage-primary"],
      libraryURL: flags["storage-library"],

      minioPort: flags["s3-port"],
      minioConsolePort: flags["s3-console-port"],

      configOptions: {
        grpc: { listen: listenGrpc },
        monitoring: { listen: listenMon },
        debug: { listen: listenDbg },
        license: { value: flags["license"], file: flags["license-file"] },
        log: { path: logFile },
        localRoot: storage,
        core: {
          auth: { enabled: authEnabled, drivers: authDrivers },
        },

        // Backend could consume a lot of CPU power,
        // we want to keep at least a couple for UI and other apps to work.
        numCpu: Math.max(os.cpus().length - 2, 1),

        storages: {
          work: { type: "FS", rootPath: flags["storage-work"] },
        },
      },
    };

    const instance = core.createLocalS3(instanceName, startOptions);

    if (startOptions.binaryPath || startOptions.sourcesPath) {
      core.switchInstance(instance);
    } else {
      await platforma
        .getBinary(logger, { version: flags.version })
        .then(() => {
          const children = core.switchInstance(instance);

          const results: Promise<void>[] = [];
          for (const child of children) {
            results.push(
              new Promise((resolve, reject) => {
                child.on("close", resolve);
                child.on("error", reject);
              }),
            );
          }

          return Promise.all(results);
        })
        .catch(function (err: Error) {
          logger.error(err.message);
        });
    }
  });

  return cmd;
}
