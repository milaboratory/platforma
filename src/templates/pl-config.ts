import { randomBytes } from 'crypto';
import * as types from './types';
import { assertNever, resolveTilde } from '../util';
import state from '../state';

export { plOptions } from './types';

export function storageSettingsFromURL(storageURL: string, baseDir?: string): types.storageOptions {
  storageURL = resolveTilde(storageURL);
  const url = new URL(storageURL, `file:${baseDir}`);

  switch (url.protocol) {
    case 's3:':
      var bucketName = url.hostname;
      var region = url.searchParams.get('region');
      return {
        type: 'S3',
        bucketName,
        region
      } as types.storageOptions;

    case 's3e:':
      return {
        type: 'S3',
        endpoint: `http://${url.host}/`,
        bucketName: url.pathname.split('/')[1], // '/bucket/key' -> ['', 'bucket', 'key']. Leading slash causes '' to be first element
        region: url.searchParams.get('region'),
        key: url.username ? `static:${url.username}` : '',
        secret: url.password ? `static:${url.password}` : ''
      } as types.storageOptions;

    case 's3es:':
      return {
        type: 'S3',
        endpoint: `https://${url.host}/`,
        bucketName: url.pathname.split('/')[1], // '/bucket/key' -> ['', 'bucket', 'key']. Leading slash causes '' to be first element
        region: url.searchParams.get('region'),
        key: url.username ? `static:${url.username}` : '',
        secret: url.password ? `static:${url.password}` : ''
      } as types.storageOptions;

    case 'file:':
      return {
        type: 'FS',
        rootPath: url.pathname
      };

    default:
      throw new Error(`storage protocol '${url.protocol}' is not supported`);
  }
}

export function loadDefaults(jwtKey: string, options?: types.plOptions): types.plSettings {
  const localRoot = options?.localRoot ?? state.path('local-pl');

  const log: types.logSettings = {
    level: options?.log?.level ?? 'info',
    path: options?.log?.path ?? `${localRoot}/platforma.log`
  };

  const grpc: types.grpcSettings = {
    listen: options?.grpc?.listen ?? 'localhost:6345',
    tls: {
      enable: defaultBool(options?.grpc?.tls?.enable, false),
      clientAuthMode: options?.grpc?.tls?.clientAuthMode ?? 'NoAuth',
      certFile: options?.grpc?.tls?.certFile ?? `${localRoot}/certs/server-cert.pem`,
      keyFile: options?.grpc?.tls?.keyFile ?? `${localRoot}/certs/server-key.pem`,

      ...options?.grpc?.tls
    }
  };

  const core: types.coreSettings = {
    auth: {
      enabled: options?.core?.auth?.enabled ?? false,
      drivers: options?.core?.auth?.drivers ?? [
        { driver: 'jwt', key: jwtKey },
        { driver: 'htpasswd', path: `${localRoot}/users.htpasswd` }
      ]
    }
  };

  const primary = defaultStorageSettings(
    'main',
    `${localRoot}/storages/main`,
    'main-bucket',
    options?.storages?.primary
  );

  var work: types.storageSettings;
  const wType = options?.storages?.work?.type;
  switch (wType) {
    case undefined:
    case 'FS':
      work = types.emptyFSSettings('work');
      work.rootPath = options?.storages?.work?.rootPath ?? `${localRoot}/storages/work`;
      work.indexCachePeriod = options?.storages?.work?.indexCachePeriod ?? '1m';
      break;

    default:
      throw new Error("work storage MUST have 'FS' type as it is used for working directories management");
  }

  const library = defaultStorageSettings(
    'library',
    `${localRoot}/storages/library`,
    'library-bucket',
    options?.storages?.library
  );

  const monitoring: types.monitoringSettings = {
    enabled: defaultBool(options?.monitoring?.enabled, true),
    listen: options?.monitoring?.listen ?? '127.0.0.1:9090'
  };
  const debug: types.debugSettings = {
    enabled: defaultBool(options?.debug?.enabled, true),
    listen: options?.debug?.listen ?? '127.0.0.1:9091'
  };
  const license: types.licenseSettings = {
    value: options?.license?.value ?? '',
    file: options?.license?.file ?? ''
  };

  return {
    localRoot,
    license,
    log,
    grpc,
    core,
    monitoring,
    debug,
    storages: { primary, work, library },
    hacks: { libraryDownloadable: true }
  };
}

function defaultStorageSettings(
  storageID: string,
  defaultLocation: string,
  defaultBucket: string,
  options?: types.storageOptions
): types.storageSettings {
  var storage: types.storageSettings;
  const pType = options?.type;
  switch (pType) {
    case undefined:
    case 'FS':
      storage = types.emptyFSSettings(storageID);
      storage.rootPath = options?.rootPath ?? defaultLocation;
      break;

    case 'S3':
      storage = types.emptyS3Settings(storageID);

      storage.endpoint = options?.endpoint ?? 'http://localhost:9000';
      storage.presignEndpoint = options?.presignEndpoint ?? 'http://localhost:9000';
      storage.bucketName = options?.bucketName ?? defaultBucket;
      storage.createBucket = defaultBool(options?.createBucket, true);
      storage.forcePathStyle = defaultBool(options?.forcePathStyle, true);
      storage.key = options?.key ?? '';
      storage.secret = options?.secret ?? '';
      storage.accessPrefixes = options?.accessPrefixes ?? [''];
      storage.uploadKeyPrefix = options?.uploadKeyPrefix ?? '';
      break;

    default:
      assertNever(pType);
      throw new Error('unknown storage type'); // calm down TS type analyzer
  }

  return storage;
}

export function render(options: types.plSettings): string {
  const disableMon = options.monitoring.enabled ? '' : ' disabled';
  const disableDbg = options.debug.enabled ? '' : ' disabled';
  const disableTLS = options.grpc.tls.enable ? '' : ' disabled';
  const libraryDownloadable = options.hacks.libraryDownloadable ? 'true' : 'false';

  return `
license:
  value: '${options.license.value}'
  file: '${options.license.file}'

logging:
  level: '${options.log.level}'
  destinations:
    - path: '${options.log.path}'

monitoring${disableMon}:
  listen: '${options.monitoring.listen}'

debug${disableDbg}:
  listen: '${options.debug.listen}'

grpcServer:
  listen: '${options.grpc.listen}'

  tls${disableTLS}:
    clientAuthMode: '${options.grpc.tls.clientAuthMode}'
    certificates:
      - certFile: '${options.grpc.tls.certFile}'
        keyFile: '${options.grpc.tls.keyFile}'

core:
  logging:
    extendedInfo: true
    dumpResourceData: true

  authEnabled: ${JSON.stringify(options.core.auth.enabled)}
  auth: ${JSON.stringify(options.core.auth.drivers)}
  db:
    path: '${options.localRoot}/db'

controllers:
  data:
    main:
      storages:
          main:
              mode: primary
              downloadable: true

          library:
              mode: passive
              downloadable: ${libraryDownloadable}

          work:
              mode: active
              downloadable: false

    storages:
      - ${JSON.stringify(options.storages.primary)}
      - ${JSON.stringify(options.storages.library)}
      - ${JSON.stringify(options.storages.work)}

  runner:
    type: local
    storageRoot: '${(options.storages.work as types.fsStorageSettings).rootPath}'

  packageLoader:
    packagesRoot: '${options.localRoot}/packages'

    registries:
      - name: "milaboratories"
        endpoints:
          - type: "url"
            url: "https://bin.registry.platforma.bio/"

  workflows: {}
`;
}

function defaultBool(v: boolean | undefined, def: boolean): boolean {
  return v === undefined ? def : v;
}
