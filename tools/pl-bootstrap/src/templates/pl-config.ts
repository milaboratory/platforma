import * as types from "./types";
import { assertNever, resolveTilde } from "../util";
import state from "../state";

export type { plOptions } from "./types";

export function storageSettingsFromURL(
  storageURL: string,
  baseDir?: string,
  defaults?: types.storageOptions,
): types.storageOptions {
  storageURL = resolveTilde(storageURL);
  const url = new URL(storageURL, `file:${baseDir}`);

  switch (url.protocol) {
    case "s3:": {
      const bucketName = url.hostname;
      const region = url.searchParams.get("region");
      const keyPrefix = url.pathname.slice(1); // 's3://bucket/' will have '/' as pathname. We don't want to always have '/' prefix

      return {
        ...defaults,

        type: "S3",
        bucketName,
        region,
        keyPrefix,
      } as types.storageOptions;
    }
    case "s3e:": {
      const p = url.pathname.split("/").slice(1); // '/bucket/key/prefix' -> ['', 'bucket', 'key' 'prefix'] -> ['bucket', 'key', 'prefix']
      const bucketName = p[0];
      const keyPrefix = p.length > 1 ? p.slice(1).join("/") : "";

      return {
        ...defaults,

        type: "S3",
        endpoint: `http://${url.host}/`,
        bucketName,
        keyPrefix,
        region: url.searchParams.get("region"),
        key: url.username ? `static:${url.username}` : "",
        secret: url.password ? `static:${url.password}` : "",
      } as types.storageOptions;
    }
    case "s3es:": {
      const p = url.pathname.split("/").slice(1); // '/bucket/key/prefix' -> ['', 'bucket', 'key' 'prefix'] -> ['bucket', 'key', 'prefix']
      const bucketName = p[0];
      const keyPrefix = p.length > 1 ? p.slice(1).join("/") : "";

      return {
        ...defaults,

        type: "S3",
        endpoint: `https://${url.host}/`,
        bucketName,
        keyPrefix,
        region: url.searchParams.get("region"),
        key: url.username ? `static:${url.username}` : "",
        secret: url.password ? `static:${url.password}` : "",
      } as types.storageOptions;
    }
    case "file:":
      return {
        type: "FS",
        rootPath: url.pathname,
      };

    default:
      throw new Error(`storage protocol '${url.protocol}' is not supported`);
  }
}

export function loadDefaults(jwtKey: string, options?: types.plOptions): types.plSettings {
  const localRoot = options?.localRoot ?? state.instanceDir("default");

  const log: types.logSettings = {
    level: options?.log?.level ?? "info",
    path: options?.log?.path ?? `${localRoot}/logs/platforma.log`,
  };

  const grpc: types.grpcSettings = {
    listen: options?.grpc?.listen ?? "localhost:6345",
    tls: {
      enable: defaultBool(options?.grpc?.tls?.enable, false),
      certFile: options?.grpc?.tls?.certFile ?? `${localRoot}/certs/tls.cert`,
      keyFile: options?.grpc?.tls?.keyFile ?? `${localRoot}/certs/tls.key`,

      ...options?.grpc?.tls,
    },
  };

  const core: types.coreSettings = {
    auth: {
      enabled: options?.core?.auth?.enabled ?? false,
      drivers: options?.core?.auth?.drivers ?? [
        { driver: "jwt", key: jwtKey },
        { driver: "htpasswd", path: `${localRoot}/users.htpasswd` },
      ],
    },
    db: {
      path: `${localRoot}/db`,
    },
  };

  const primary = defaultStorageSettings(
    "main",
    `${localRoot}/storages/main`,
    "platforma-primary-bucket",
    options?.storages?.primary,
  );

  let work: types.storageSettings;
  const wType = options?.storages?.work?.type;
  switch (wType) {
    case undefined:
    case "FS":
      work = types.emptyFSSettings("work");
      work.rootPath = options?.storages?.work?.rootPath ?? `${localRoot}/storages/work`;
      work.indexCachePeriod = options?.storages?.work?.indexCachePeriod ?? "1m";
      break;

    default:
      throw new Error(
        "work storage MUST have 'FS' type as it is used for working directories management",
      );
  }

  const library = defaultStorageSettings(
    "library",
    `${localRoot}/storages/library`,
    "platforma-library-bucket",
    options?.storages?.library,
  );

  const monitoring: types.monitoringSettings = {
    enabled: defaultBool(options?.monitoring?.enabled, true),
    listen: options?.monitoring?.listen ?? "127.0.0.1:9090",
  };
  const debug: types.debugSettings = {
    enabled: defaultBool(options?.debug?.enabled, true),
    listen: options?.debug?.listen ?? "127.0.0.1:9091",
  };
  const license: types.licenseSettings = {
    value: options?.license?.value ?? "",
    file: options?.license?.file ?? "",
  };

  return {
    localRoot,
    license,
    log,
    grpc,
    core,
    monitoring,
    debug,
    numCpu: options?.numCpu,
    storages: { primary, work, library },
  };
}

function defaultStorageSettings(
  storageID: string,
  defaultLocation: string,
  defaultBucket: string,
  options?: types.storageOptions,
): types.storageSettings {
  let storage: types.storageSettings;
  const pType = options?.type;
  switch (pType) {
    case undefined:
    case "FS":
      storage = types.emptyFSSettings(storageID);
      storage.rootPath = options?.rootPath ?? defaultLocation;
      break;

    case "S3":
      storage = types.emptyS3Settings(storageID);

      storage.endpoint = options?.endpoint;
      storage.region = options?.region;
      storage.presignEndpoint = options?.presignEndpoint ?? options?.endpoint;
      storage.bucketName = options?.bucketName ?? defaultBucket;
      storage.createBucket = defaultBool(options?.createBucket, true);
      storage.forcePathStyle = defaultBool(options?.forcePathStyle, true);
      storage.key = options?.key ?? "";
      storage.secret = options?.secret ?? "";
      storage.keyPrefix = options?.keyPrefix ?? "";
      storage.accessPrefixes = options?.accessPrefixes ?? [""];
      storage.uploadKeyPrefix = options?.uploadKeyPrefix ?? "";
      break;

    default:
      assertNever(pType);
      throw new Error("unknown storage type"); // calm down TS type analyzer
  }

  return storage;
}

/** Storage IDs the yaml configuration of earlier versions declared: kept so existing instances keep their data. */
const PrimaryStorageID = "main";
const WorkStorageID = "work";
const LibraryStorageID = "library";

/**
 * Backend command-line options and environment for a local instance.
 * Check `platforma --help` for the options.
 *
 * @param masterSecretFile - a file with the master secret, required by htpasswd and LDAP auth.
 */
export function cliArgs(
  options: types.plSettings,
  masterSecretFile: string,
): { args: string[]; env: NodeJS.ProcessEnv } {
  const env: NodeJS.ProcessEnv = {};
  const args: string[] = ["--quiet"];

  const grpc = splitHostPort(options.grpc.listen);
  args.push(`--listen-address=${grpc.host}`);
  if (grpc.port) args.push(`--listen-port=${grpc.port}`);
  if (options.grpc.tls.enable) {
    args.push(`--listen-tls=${options.grpc.tls.certFile},${options.grpc.tls.keyFile}`);
  }

  if (options.monitoring.enabled) {
    const mon = splitHostPort(options.monitoring.listen);
    args.push(`--monitoring-ip=${mon.host}`);
    if (mon.port) args.push(`--monitoring-port=${mon.port}`);
  } else {
    args.push("--no-monitoring");
  }

  if (options.debug.enabled) {
    const dbg = splitHostPort(options.debug.listen);
    args.push("--debug-enabled", `--debug-ip=${dbg.host}`);
    if (dbg.port) args.push(`--debug-port=${dbg.port}`);
  }

  if (options.license.file !== "") args.push(`--license-file=${options.license.file}`);
  // The value goes through the environment to keep it out of the process list.
  else if (options.license.value !== "") env.PL_LICENSE = options.license.value;

  args.push(
    `--log-level=${options.log.level}`,
    `--log-dst=file://${options.log.path}`,
    "--log-rotation-size=1GiB",
    "--log-rotation-backups=15",
  );

  let hasAuthDriver = false;
  for (const drv of options.core.auth.drivers) {
    switch (drv.driver) {
      case "htpasswd":
        args.push(`--auth-htpasswd=${drv.path}`);
        hasAuthDriver = true;
        break;
      case "ldap":
        args.push(`--auth-ldap-server=${drv.serverUrl}`, `--auth-ldap-dn=${drv.defaultDN}`);
        hasAuthDriver = true;
        break;
      case "jwt":
        // the backend signs tokens with the master secret
        break;
      default:
        assertNever(drv);
    }
  }
  if (hasAuthDriver) args.push(`--master-secret-file=${masterSecretFile}`);

  args.push(
    `--main-root=${options.localRoot}`,
    `--db-dir=${options.core.db.path}`,
    `--packages-dir=${options.localRoot}/packages`,
    `--work-dir=${options.storages.work.rootPath}`,
    `--primary-storage-id=${PrimaryStorageID}`,
    `--work-storage-id=${WorkStorageID}`,
  );

  const primary = options.storages.primary;
  switch (primary.type) {
    case "FS":
      args.push(`--primary-storage-fs=${primary.rootPath}`);
      break;
    case "S3":
      args.push(`--primary-storage-s3=${s3URL(primary)}`);
      if (primary.region) args.push(`--primary-storage-s3-region=${primary.region}`);
      if (primary.key) args.push(`--primary-storage-s3-key=${staticValue(primary.key)}`);
      if (primary.secret) env.PL_PRIMARY_STORAGE_S3_SECRET = staticValue(primary.secret);
      if (primary.presignEndpoint && primary.presignEndpoint !== primary.endpoint) {
        args.push(`--primary-storage-s3-external-endpoint=${primary.presignEndpoint}`);
      }
      break;
    default:
      assertNever(primary);
  }

  const library = options.storages.library;
  const lib = (v: string) => `${LibraryStorageID}=${v}`;
  switch (library.type) {
    case "FS":
      args.push(`--data-library-fs=${lib(library.rootPath)}`);
      break;
    case "S3":
      args.push(`--data-library-s3=${lib(s3URL(library))}`);
      if (library.region) args.push(`--data-library-s3-region=${lib(library.region)}`);
      if (library.key) args.push(`--data-library-s3-key=${lib(staticValue(library.key))}`);
      if (library.secret) env.PL_DATA_LIBRARY_S3_SECRET = lib(staticValue(library.secret));
      if (library.presignEndpoint && library.presignEndpoint !== library.endpoint) {
        args.push(`--data-library-s3-external-endpoint=${lib(library.presignEndpoint)}`);
      }
      break;
    default:
      assertNever(library);
  }

  args.push("--keep-good-workdirs=20m", "--keep-faulty-workdirs=1h");
  if (options.numCpu) args.push(`--runner-local-cpu=${options.numCpu}`);

  return { args, env };
}

/** Splits 'host:port' listen address. */
function splitHostPort(listen: string): { host: string; port?: string } {
  const i = listen.lastIndexOf(":");
  if (i < 0) return { host: listen };
  return { host: listen.slice(0, i), port: listen.slice(i + 1) };
}

/** S3 storage URL in the form the backend options take. */
function s3URL(s: types.s3StorageSettings): string {
  const prefix = s.keyPrefix ? `/${s.keyPrefix.replace(/^\/+/, "")}` : "";
  if (!s.endpoint) return `s3://${s.bucketName}${prefix}`;
  return `${s.endpoint.replace(/\/+$/, "")}/${s.bucketName}${prefix}`;
}

/** The backend options take S3 credentials without the 'static:' prefix of the yaml configuration. */
function staticValue(v: string): string {
  return v.startsWith("static:") ? v.slice("static:".length) : v;
}

function defaultBool(v: boolean | undefined, def: boolean): boolean {
  return v === undefined ? def : v;
}
