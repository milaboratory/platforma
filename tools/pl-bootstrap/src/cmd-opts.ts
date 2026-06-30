import { Command, Option } from "commander";
import type { FlagDefinition } from "./commands/svc/create/arg-parser";

/** Add one or more groups of options to a command, preserving group order. */
export function addOptions(cmd: Command, ...optionGroups: Option[][]): Command {
  for (const group of optionGroups) {
    for (const opt of group) cmd.addOption(opt);
  }
  return cmd;
}

const toInt = (v: string): number => parseInt(v, 10);

// Repeatable option collector: `--mount a --mount b` -> ["a","b"].
const collect = (value: string, previous?: string[]): string[] => [...(previous ?? []), value];

export const GlobalOptions = (): Option[] => [
  new Option("--log-level <level>", "logging level")
    .choices(["error", "warn", "info", "debug"])
    .default("info"),
];

export const ImageOptions = (): Option[] => [
  new Option("--image <image>", "use custom docker image to run platforma"),
];

export const VersionOptions = (): Option[] => [
  new Option(
    "--version <version>",
    "use custom platforma release (official docker image or binary package)",
  ),
];

export const ArchOptions = (): Option[] => [
  new Option(
    "--arch <arch>",
    "override architecture. You can start amd64 linux image on arm-based host (say, Apple M family processor). I.e. arm64, amd64, amd64/v2",
  ),
];

export const LicenseOptions = (): Option[] => [
  new Option(
    "--license <license>",
    'pass a license code. The license can be got from "https://platforma.bio/getlicense".',
  ),
  new Option(
    "--license-file <path>",
    "specify a path to the file with a license. The license can be got from 'https://platforma.bio/getlicense'.",
  ),
];

export const AddressesOptions = (): Option[] => [
  new Option("--grpc-port <port>", "port for Platforma Backend gRPC API. Default is 6345")
    .argParser(toInt)
    .env("PLATFORMA_GRPC_PORT"),
  new Option(
    "--grpc-listen <addr>",
    "full listen addr for Platforma Backend gRPC API. Default is 127.0.0.1:6345",
  ).env("PLATFORMA_GRPC_LISTEN"),
  new Option(
    "--monitoring-port <port>",
    "port for Platforma Backend monitoring API. Default is 9090",
  )
    .argParser(toInt)
    .env("PLATFORMA_MONITORING_PORT"),
  new Option(
    "--monitoring-listen <addr>",
    "full listen addr for Platforma Backend monitoring API. Default is 127.0.0.1:9090",
  ).env("PLATFORMA_MONITORING_LISTEN"),
  new Option("--debug-port <port>", "port for Platforma Backend debug API. Default is 9091")
    .argParser(toInt)
    .env("PLATFORMA_DEBUG_PORT"),
  new Option(
    "--debug-listen <addr>",
    "full listen addr for Platforma Backend debug API. Default is 127.0.0.1:9091",
  ).env("PLATFORMA_DEBUG_LISTEN"),
];

export const S3AddressesOptions = (): Option[] => [
  new Option("--s3-port <port>", "port that S3 will listen, default is 9000")
    .argParser(toInt)
    .default(9000)
    .env("PLATFORMA_S3_PORT"),
  new Option("--s3-console-port <port>", "port that a console of S3 will listen, default is 9001")
    .argParser(toInt)
    .default(9001)
    .env("PLATFORMA_S3_CONSOLE_PORT"),
];

export const StorageOptions = (): Option[] => [
  new Option(
    "--storage <path>",
    "specify path on host to be used as storage for all Platforma Backend data",
  ),
];

export const MinioPresignHostOptions = (): Option[] => [
  new Option("--minio-presign-host", "use 'minio' host instead of 'localhost' in presign URLs"),
];

export const MountOptions = (): Option[] => [
  new Option(
    "--mount <path>",
    "things to be mounted into platforma docker container. Targets will appear inside the container under the same absolute paths",
  ).argParser(collect),
];

export const PlLogFileOptions = (): Option[] => [
  new Option("--pl-log-file <path>", "specify path for Platforma Backend log file"),
];

export const PlWorkdirOptions = (): Option[] => [
  new Option("--pl-workdir <path>", "specify working directory for Platforma Backend process"),
];

export const PlBinaryOptions = (): Option[] => [
  new Option(
    "--pl-binary <path>",
    "start given Platforma Backend binary instead of automatically downloaded version",
  ),
];

export const PlSourcesOptions = (): Option[] => [
  new Option(
    "--pl-sources <path>",
    "path to pl repository root: build Platforma Backend from sources and start the resulting binary",
  ),
];

export const ConfigOptions = (): Option[] => [
  new Option("--config <path>", "use custom Platforma Backend config"),
];

export const StoragePrimaryURLOptions = (): Option[] => [
  new Option(
    "--storage-primary <url>",
    "specify 'primary' storage destination URL.\n" +
      "\tfile:/path/to/dir for directory on local FS\n" +
      "\ts3://<bucket>/?region=<name> for real AWS bucket\n" +
      "\ts3e://<endpoint>/<bucket>/?region=<name> for bucket behind custom endpoint via http\n" +
      "\ts3es://<endpoint>/<bucket>/?region=<name> for bucket behind custom endpoint via https",
  ),
];

export const StorageWorkPathOptions = (): Option[] => [
  new Option("--storage-work <path>", "specify path on host to be used as 'work' storage"),
];

export const StorageLibraryURLOptions = (): Option[] => [
  new Option(
    "--storage-library <url>",
    "specify 'library' storage destination URL.\n" +
      "\tfile:/path/to/dir for directory on local FS\n" +
      "\ts3://<bucket>/?region=<name> for real AWS bucket\n" +
      "\ts3e://<endpoint>/<bucket>/?region=<name> for bucket behind custom endpoint via http\n" +
      "\ts3es://<endpoint>/<bucket>/?region=<name> for bucket behind custom endpoint via https",
  ),
];

export const AuthOptions = (): Option[] => [
  new Option("--auth-enabled", "enable authorization"),
  new Option(
    "--auth-htpasswd-file <path>",
    "path to .htpasswd file with Platforma users (static user DB auth source)",
  ),
  new Option(
    "--auth-ldap-server <addr>",
    "address of LDAP server to use for auth in Platforma (auth source)",
  ),
  new Option(
    "--auth-ldap-default-dn <dn>",
    "DN to use when checking user with LDAP bind operation: e.g. cn=%u,ou=users,dc=example,dc=com",
  ),
];

/** Flag bag keyed by CLI flag name; `toFlags` adapts commander's camelCased
 * option values into this shape, which command bodies and `core.*` helpers read. */
export interface Flags {
  "log-level"?: string;
  image?: string;
  version?: string;
  arch?: string;
  license?: string;
  "license-file"?: string;
  "grpc-port"?: number;
  "grpc-listen"?: string;
  "monitoring-port"?: number;
  "monitoring-listen"?: string;
  "debug-port"?: number;
  "debug-listen"?: string;
  "s3-port"?: number;
  "s3-console-port"?: number;
  storage?: string;
  "minio-presign-host"?: boolean;
  mount?: string[];
  "pl-log-file"?: string;
  "pl-workdir"?: string;
  "pl-binary"?: string;
  "pl-sources"?: string;
  config?: string;
  "storage-primary"?: string;
  "storage-work"?: string;
  "storage-library"?: string;
  "auth-enabled"?: boolean;
  "auth-htpasswd-file"?: string;
  "auth-ldap-server"?: string;
  "auth-ldap-default-dn"?: string;
}

export function toFlags(o: Record<string, unknown>): Flags {
  return {
    "log-level": o.logLevel as string | undefined,
    image: o.image as string | undefined,
    version: o.version as string | undefined,
    arch: o.arch as string | undefined,
    license: o.license as string | undefined,
    "license-file": o.licenseFile as string | undefined,
    "grpc-port": o.grpcPort as number | undefined,
    "grpc-listen": o.grpcListen as string | undefined,
    "monitoring-port": o.monitoringPort as number | undefined,
    "monitoring-listen": o.monitoringListen as string | undefined,
    "debug-port": o.debugPort as number | undefined,
    "debug-listen": o.debugListen as string | undefined,
    "s3-port": o.s3Port as number | undefined,
    "s3-console-port": o.s3ConsolePort as number | undefined,
    storage: o.storage as string | undefined,
    "minio-presign-host": o.minioPresignHost as boolean | undefined,
    mount: o.mount as string[] | undefined,
    "pl-log-file": o.plLogFile as string | undefined,
    "pl-workdir": o.plWorkdir as string | undefined,
    "pl-binary": o.plBinary as string | undefined,
    "pl-sources": o.plSources as string | undefined,
    config: o.config as string | undefined,
    "storage-primary": o.storagePrimary as string | undefined,
    "storage-work": o.storageWork as string | undefined,
    "storage-library": o.storageLibrary as string | undefined,
    "auth-enabled": o.authEnabled as boolean | undefined,
    "auth-htpasswd-file": o.authHtpasswdFile as string | undefined,
    "auth-ldap-server": o.authLdapServer as string | undefined,
    "auth-ldap-default-dn": o.authLdapDefaultDn as string | undefined,
  };
}

/** ArgParser flag-defs derived from commander Options, for the `svc create`
 * passthrough commands: booleans are value-less, the rest are plain string
 * options (value passed through verbatim), defaults carried over. */
export function argDefs(...optionGroups: Option[][]): Record<string, FlagDefinition> {
  const defs: Record<string, FlagDefinition> = {};
  for (const group of optionGroups) {
    for (const opt of group) {
      const name = opt.long?.replace(/^--/, "");
      if (!name) continue;
      defs[name] = {
        name,
        type: opt.isBoolean() ? "boolean" : "string",
        default: opt.defaultValue,
        multiple: opt.variadic,
      };
    }
  }
  return defs;
}
