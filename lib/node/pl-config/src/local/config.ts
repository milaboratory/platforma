import { notEmpty, type MiLogger } from "@milaboratories/ts-helpers";
import upath from "upath";
import fsp from "node:fs/promises";
import type { PlConfigPorts } from "../common/ports";
import { getPorts } from "../common/ports";
import type { PlLicenseMode, License } from "../common/license";
import { getLicense } from "../common/license";
import { createLocalHtpasswdFile } from "../common/auth";
import { createDefaultLocalStorages } from "../common/storages";
import { FSKVStorage } from "./fs_kv_storage";
import * as crypto from "node:crypto";
import * as os from "node:os";

export type LocalPlConfigGeneratorOptions = {
  /** Logger for Middle-Layer */
  logger: MiLogger;
  /** Working dir for a local platforma. */
  workingDir: string;
  /** How to choose ports for platforma. */
  portsMode: PlConfigPorts;
  /** How to get license. */
  licenseMode: PlLicenseMode;

  /** Do we need to download things from global access? Default false. */
  useGlobalAccess?: boolean;

  /** Number of cores local platforma could consume. Default os.cpus().length - 2.
   * Backend could consume a lot of CPU power,
   * we want to keep at least a couple for UI and other apps to work.
   */
  numCpu?: number;

  /**
   * Additional backend CLI options, appended after the generated ones.
   * Check `platforma --help` for the available options.
   */
  extraArgs?: string[];
};

const DefaultLocalPlConfigGeneratorOptions: Pick<
  LocalPlConfigGeneratorOptions,
  "useGlobalAccess" | "numCpu"
> = {
  useGlobalAccess: false,

  // Backend could consume a lot of CPU power,
  // we want to keep at least a couple for UI and other apps to work.
  numCpu: Math.max(os.cpus().length - 2, 1),
};

/** Software registry the backend uses when global access is requested. */
const GlobalAccessPackageRegistry = "platforma-open=https://bin-ga.pl-open.science";

/** Defines which storages from pl are available via local paths */
export type LocalStorageProjection = {
  /** Pl storage id */
  readonly storageId: string;

  /**
   * Local path, the storage is mounted at.
   *
   * Empty string means that this storage accepts absolute paths, and operates inside the same OS.
   * This matches the behaviour how pl interprets FS storage config.
   * */
  readonly localPath: string;
};

export type LocalPlConfigGenerationResult = {
  //
  // Pl Instance data
  //

  /** Working directory for a local platforma */
  workingDir: string;

  /** Backend CLI options for a local platforma */
  plArgs: string[];

  //
  // Data for pl client configuration
  //

  /** Address to connect client to */
  plAddress: string;
  /** Authorization credentials: user */
  plUser: string;
  /** Authorization credentials: password */
  plPassword: string;

  //
  // Data for configuration of blob drivers
  //

  readonly localStorageProjections: LocalStorageProjection[];
};

export async function generateLocalPlConfigs(
  options: LocalPlConfigGeneratorOptions,
): Promise<LocalPlConfigGenerationResult> {
  const opts: LocalPlConfigGeneratorOptions = {
    ...DefaultLocalPlConfigGeneratorOptions,
    ...options,
  };

  const workdir = upath.resolve(opts.workingDir);

  // settings that must be persisted between independent generation invocations
  const kv = await FSKVStorage.init(upath.join(workdir, "gen"));

  const user = "default-user";
  const password = await kv.getOrCreate("password", () => crypto.randomBytes(16).toString("hex"));
  // Signs JWTs and resource signatures: changing it invalidates every session and signature.
  await kv.getOrCreate("master-secret", () => crypto.randomBytes(32).toString("base64url"));

  const host = "127.0.0.1";
  const ports = await getPorts(opts.portsMode);

  const storages = await createDefaultLocalStorages(workdir, `http://${host}:${ports.http}`);
  const htpasswdFile = await createLocalHtpasswdFile(workdir, [{ user, password }]);
  const licenseFile = await localLicenseFile(workdir, await getLicense(opts.licenseMode));

  const plArgs = [
    `--listen-address=${host}`,
    `--listen-port=${ports.grpc}`,
    `--listen-http-port=${ports.http}`,
    `--monitoring-ip=${host}`,
    `--monitoring-port=${ports.monitoring}`,
    "--debug-enabled",
    `--debug-ip=${host}`,
    `--debug-port=${ports.debug}`,

    `--main-root=${workdir}`,
    `--db-dir=${upath.join(workdir, "db")}`,
    `--work-dir=${storages.runner}`,
    `--packages-dir=${upath.join(workdir, "packages")}`,
    `--primary-storage-fs=${storages.mainStoragePath}`,
    `--primary-storage-fs-url=http://${host}:${ports.http}`,

    // Storages are kept as the yaml configuration of earlier versions declared them,
    // so projects created there keep working.
    "--primary-storage-id=main",
    "--work-storage-id=work",
    "--host-data-library-id=root",
    "--host-data-library-downloadable",
    "--primary-storage-fs-local-access",

    `--auth-htpasswd=${htpasswdFile}`,
    `--master-secret-file=${upath.join(workdir, "gen", "master-secret")}`,
    `--license-file=${licenseFile}`,

    `--runner-local-cpu=${notEmpty(opts.numCpu)}`,
    "--keep-faulty-workdirs=1h",

    `--log-dst=file://${upath.join(workdir, "platforma.log")}`,
  ];

  if (opts.useGlobalAccess) plArgs.push(`--package-registry=${GlobalAccessPackageRegistry}`);
  if (opts.extraArgs) plArgs.push(...opts.extraArgs);

  return {
    workingDir: opts.workingDir,

    plArgs,

    plAddress: `${host}:${ports.grpc}`,
    plUser: user,
    plPassword: password,

    localStorageProjections: storages.storages
      .filter((s) => s.main.downloadable && s.localPath !== undefined)
      .map((s) => ({
        storageId: s.storage.id,
        localPath: s.localPath!,
      })),
  };
}

/** Gets a path to the license file, writing the license value into the working dir if needed. */
async function localLicenseFile(workdir: string, license: License): Promise<string> {
  if (license.type === "file") return license.file;

  const file = upath.join(workdir, "gen", "license");
  await fsp.writeFile(file, license.value, { mode: 0o600 });
  // mode is applied only when the file is created
  await fsp.chmod(file, 0o600);
  return file;
}
