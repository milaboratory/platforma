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
  auth: PlAuthSettings[];
  db: PlDbSettings;
};

export type PlCoreLoggingSettings = {
  extendedInfo: boolean;
  dumpResourceData: boolean;
};

export type PlAuthSettings = {
  drivers: PlAuthDriver[];
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

export type PlTlsSettings = {
  enable: boolean;
  clientAuthMode?: PlTlsAuthMode;
  certFile?: string;
  keyFile?: string;
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
  workflows: PlControllerWorkflowsSettings
};

export type PlControllerDataSettings = {
  main: PlControllerDataMainSettings;
  storages: PlControllerDataStoragesSettings[];
}

export type PlControllerDataMainSettings = {
  storages: PlControllerDataMainStoragesSettings[];
}

export type PlControllerDataMainStoragesSettings = {
  mode: 'primary' | 'active' | 'passive';
  downloadable: boolean;
}

export type PlControllerDataStoragesSettings =PlS3StorageSettings | PlFsStorageSettings;

type PlStorageID = { id: string };
type PlCommonStorageSettings = {
  indexCachePeriod: string;
};

export type PlS3StorageSettings = PlStorageID &
  PlS3StorageType &
  PlCommonStorageSettings &
  PlS3StorageTypeSettings;

type PlS3StorageType = { type: 'S3' };
type PlS3StorageTypeSettings = {
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

export function emptyFSSettings(id: string): PlFsStorageSettings {
  return {
    id: id,
    type: 'FS',
    indexCachePeriod: '0s',
    rootPath: ''
  };
}

type PlFsStorageType = { type: 'FS' };
type PlFsStorageTypeSettings = {
  rootPath: string;
};

export type PlControllerRunnerSettings = {
  type: string;
  storageRoot: string;
  secrets: PlControllerRunnerSecretsSettings;
}

export type PlControllerRunnerSecretsSettings = {
  map: Record<string, string>
}

export type PlControllerPackageLoaderSettings = {
  packagesRoot: string;
}

export type PlControllerWorkflowsSettings = {
}
