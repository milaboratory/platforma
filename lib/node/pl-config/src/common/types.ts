// TODO: should we change all of this to zod?

export type PlConfig = {
  license: PlLicenseSettings;
  logging: PlLoggingSettings;
  monitoring: PlMonitoringSettings;
  debug: PlDebugSettings;
  core: PlCoreSettings;
  controllers: PlControllersSettings;
};

export type PlLicenseSettings = {
  value: string;
  file: string;
};

export type PlLoggingSettings = {
  level: PlLogLevel;
  destinations: PlLoggingDestination[];
};

export type PlLogLevel = 'debug' | 'info' | 'error' | 'warn';

export type PlLoggingDestination = {
  path: string;
};

export type PlMonitoringSettings = {
  enabled: boolean;
  listen: string;
};

export type PlDebugSettings = {
  enabled: boolean;
  listen: string;
};

export type PlCoreSettings = {
  logging: PlCoreLoggingSettings;
  grpc: PlGrpcSettings;
  authEnabled: boolean;
  auth: PlAuthDriver[];
  db: PlDbSettings;
};

export type PlCoreLoggingSettings = {
  extendedInfo: boolean;
  dumpResourceData: boolean;
};

export type PlDbSettings = {
  path: string;
};

export type PlAuthDriver =
  | {
    driver: 'ldap';
    serverUrl: string; // 'ldaps://ldap.example.com:1111'
    defaultDN: string; // 'cn=%u,ou=users,ou=users,dc=example,dc=com'
  }
  | {
    driver: 'jwt';
    key: string;
  }
  | {
    driver: 'htpasswd';
    path: string;
  };

export type PlGrpcSettings = {
  listen: string;
  tls: PlTlsSettings;
};

export type PlTlsSettings =
  | {
    enabled: false;
  }
  | {
    enabled: true;
    clientAuthMode: PlTlsAuthMode;
    certFile: string;
    keyFile: string;
  };

export type PlTlsAuthMode =
  | 'NoAuth'
  | 'RequestAnyCert'
  | 'RequireAnyCert'
  | 'RequestValidCert'
  | 'RequireValidCert';

export type PlControllersSettings = {
  data: PlControllerDataSettings;
  runner: PlControllerRunnerSettings;
  packageLoader: PlControllerPackageLoaderSettings;
  workflows: PlControllerWorkflowsSettings;
};

export type PlControllerDataSettings = {
  main: PlControllerDataMainSettings;
  storages: PlControllerDataStoragesSettings[];
};

export type PlControllerDataMainSettings = {
  storages: Record<string, PlControllerDataMainStoragesSettings>;
};

export type PlControllerDataMainStoragesSettings = {
  mode: 'primary' | 'active' | 'passive';
  downloadable: boolean;
};

export type PlControllerDataStoragesSettings = PlS3StorageSettings | PlFsStorageSettings;

export type PlStorageID = { id: string };

export type PlCommonStorageSettings = {
  indexCachePeriod: string;
};

export type PlS3StorageSettings = PlStorageID &
  PlS3StorageType &
  PlCommonStorageSettings &
  PlS3StorageTypeSettings;

export type PlS3StorageType = { type: 'S3' };
export type PlS3StorageTypeSettings = {
  endpoint: string;
  presignEndpoint: string;
  region: string;
  bucketName: string;
  createBucket: boolean;
  forcePathStyle: boolean;
  key: string;
  secret: string;
  keyPrefix: string;
  accessPrefixes: string[];
  uploadKeyPrefix: string;
};

export type PlFsStorageSettings = PlStorageID &
  PlFsStorageType &
  PlCommonStorageSettings &
  PlFsStorageTypeSettings;

type PlFsStorageType = { type: 'FS' };

type PlFsStorageTypeSettings = {
  rootPath: string;
};

export type PlControllerRunnerSettings = {
  type: string;
  storageRoot: string;
  workdirCacheOnFailure: string;
  secrets: PlControllerRunnerSecretsSettings[];
};

export type PlControllerRunnerSecretsSettings = {
  map: Record<string, string>;
};

export type PlControllerPackageLoaderSettings = {
  packagesRoot: string;
  registries?: PlControllerPackageLoaderRegistry[];
};

export type PlControllerPackageLoaderRegistry = {
  name: string;
  endpoints: PlControllerPackageLoaderEndpoint[];
};

export type PlControllerPackageLoaderEndpoint =
  | {
    type: 'local';
    path: string;
  }
  | {
    type: 'url';
    url: string;
  };

export type PlControllerWorkflowsSettings = {};
