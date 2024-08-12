export type plSettings = {
    localRoot: string

    log: logSettings
    grpc: grpcSettings
    core: coreSettings
    storages: storagesSettings

    monitoring: monitoringSettings
    debug: debugSettings
}
export type plOptions = {
    localRoot?: string

    log?: logOptions
    grpc?: grpcOptions
    core?: coreOptions
    storages?: storagesOptions

    monitoring?: monitoringOptions
    debug?: debugOptions
}

export type logSettings = {
    level: string
    path: string
}
export type logOptions = DeepPartial<logSettings>

export type coreSettings = {
    auth: authSettings
}
export type coreOptions = {
    auth?: authOptions
}

export type authSettings = {
    enabled: boolean
    drivers: authDriver[]
}
export type authOptions = Partial<authSettings>

export type authDriver = {
    driver: 'ldap',
    serverUrl: string, // 'ldaps://ldap.example.com:1111'
    defaultDN: string, // 'cn=%u,ou=users,ou=users,dc=example,dc=com'
} | {
    driver: 'jwt',
    key: string,
} | {
    driver: 'htpasswd',
    path: string,
}

export type grpcSettings = {
    listen: string
    tls: tlsSettings
}
export type grpcOptions = Partial<grpcSettings>

export type tlsSettings = {
    enable: boolean,
    clientAuthMode: tlsAuthMode
    certFile: string,
    keyFile: string,
}
export type tlsOptions = Partial<tlsSettings>

export type tlsAuthMode = 'NoAuth' | 'RequestAnyCert' | 'RequireAnyCert' | 'RequestValidCert' | 'RequireValidCert'

export type storagesSettings = {
    primary: storageSettings,
    work: storageSettings,
    library: storageSettings,
}
export type storagesOptions = {
    primary?: storageOptions,
    work?: storageOptions,
    library?: storageOptions,
}

export type storageSettings = s3StorageSettings | fsStorageSettings
export type storageOptions = s3StorageOptions | fsStorageOptions

type storageID = { id: string }
type commonStorageSettings = {
    indexCachePeriod: string
}

export type s3StorageSettings = storageID & s3StorageType & commonStorageSettings & s3StorageTypeSettings
export type s3StorageOptions = s3StorageType & Partial<commonStorageSettings> & Partial<s3StorageTypeSettings>
export function emptyS3Settings(id: string): s3StorageSettings {
    return {
        id: id,
        type: 'S3',
        indexCachePeriod: '0s',
        endpoint: '',
        region: '',
        presignEndpoint: '',
        bucketName: '',
        createBucket: false,
        key: '',
        secret: '',
        accessPrefixes: [],
        uploadKeyPrefix: ''
    }
}

type s3StorageType = { type: 'S3' }
type s3StorageTypeSettings = {
    endpoint: string,
    presignEndpoint: string,
    region: string,
    bucketName: string,
    createBucket: boolean,
    key: string,
    secret: string,
    accessPrefixes: string[],
    uploadKeyPrefix: string,
}

export type fsStorageSettings = storageID & fsStorageType & commonStorageSettings & fsStorageTypeSettings
export type fsStorageOptions = fsStorageType & Partial<commonStorageSettings> & Partial<fsStorageTypeSettings>
export function emptyFSSettings(id: string): fsStorageSettings {
    return {
        id: id,
        type: 'FS',
        indexCachePeriod: '0s',
        rootPath: '',
    }
}

type fsStorageType = { type: 'FS' }
type fsStorageTypeSettings = {
    rootPath: string,
}

export type monitoringSettings = {
    enabled: boolean
    listen: string
}
export type monitoringOptions = Partial<monitoringSettings>

export type debugSettings = {
    enabled: boolean
    listen: string
}
export type debugOptions = Partial<debugSettings>

type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
