
type authDriver = {
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

export type configOptions = {
  loglevel?: string,
  logpath?: string,
  logstdout?: boolean,

  storage?: string,
  listenAPI?: string,
  listenMonitoring?: string,
  listenDebug?: string,
  core?: {
    auth?: {
      enabled?: boolean,
      drivers?: authDriver[]
    },
  }
  tls?: {
    enable?: boolean,
    clientAuthMode?: 'NoAuth' | 'RequestAnyCert' | 'RequireAnyCert' | 'RequestValidCert' | 'RequireValidCert',
    certFile?: string,
    keyFile?: string,
  },
}

export function render(options?: configOptions) {
  const storage = options?.storage ?? './local-pl'

  const loglevel = options?.loglevel ?? 'info'
  const logpath = options?.logpath ?? options?.logstdout ? "stdout" : `${storage}/log/platforma.log`

  const listenAPI = options?.listenAPI ?? '127.0.0.1:6345'
  const listenMon = options?.listenMonitoring ?? '127.0.0.1:9090'
  const listenDbg = options?.listenDebug ?? '127.0.0.1:9091'

  //
  // Core settings
  //
  const authEnabled = options?.core?.auth?.enabled ? "true" : "false"
  const authDrivers = options?.core?.auth?.drivers ?? [
    {driver:'jwt', key: randomStr(64)}, 
    {driver: 'htpasswd', path: `${storage}/users.htpasswd`}]
  
  //
  // TLS settings
  //
  const disableTLS = options?.tls === undefined ? " disabled" : ""
  const tlsCertFile = options?.tls?.certFile ?? `${storage}/certs/server-cert.pem`
  const tlsKeyFile = options?.tls?.keyFile ?? `${storage}/certs/server-key.pem`
  const tlsClientAuthMode = options?.tls?.clientAuthMode ?? 'NoAuth'

  return `
logging:
  level: '${loglevel}'
  destinations:
    - path: '${logpath}'

monitoring:
  listen: '${listenMon}'

debug:
  listen: '${listenDbg}'

grpcServer:
  listen: '${listenAPI}'

  tls${disableTLS}:
    clientAuthMode: '${tlsClientAuthMode}'
    certificates:
      - certFile: '${tlsCertFile}'
        keyFile: '${tlsKeyFile}'

core:
  logging:
    extendedInfo: true
    dumpResourceData: true

  authEnabled: ${authEnabled}
  auth: ${JSON.stringify(authDrivers)}
  db:
    path: '${storage}/db'

controllers:
  data:
    main:
      storages:
          main:
              mode: primary
              downloadable: true

          library:
              mode: passive
              downloadable: true

          work:
              mode: active
              downloadable: false

      workdirManager: work
      uploadManager: main
      defaultDownloadable: main

    storages:
      - &mainStorage
        id: 'main'
        type: FS
        rootPath: '${storage}/storages/main'

      - &libraryStorage
        id: 'library'
        type: 'FS'
        rootPath: '${storage}/storages/library'

      - &workStorage
        id: 'work'
        type: FS
        indexCachePeriod: '1m'
        rootPath: '${storage}/storages/work'

    transfers:
      - src: *mainStorage
        dst:
          <<: *workStorage
          useHardlinks: 'auto'

      - src: *workStorage
        dst:
          <<: *mainStorage
          useHardlinks: 'auto'

      - src: *libraryStorage
        dst:
          <<: *workStorage
          useHardlinks: 'auto'

      - src: *libraryStorage
        dst:
          <<: *mainStorage
          useHardlinks: 'auto'

  runner:
    main:
      storages: [ 'work' ]

    executor:
      id: 'work'
      storageRoot: '${storage}/storages/work'
      softwareRoot: '${storage}/software/installed'
      queues:
        - name: 'heavy'
          maxConcurrency: 1
        - name: 'ui-tasks'
          maxConcurrency: 50

    softwareLoader:
      softwareRoot: '${storage}/software/installed'
      registries:
        - name: 'milaboratories'
          endpoints:
            - type: 'local'
              path: '${storage}/software/local'
            - type: 'url'
              url: 'https://bin.registry.platforma.bio/'

  templates:
    registries:
      - name: 'milaboratories'
        endpoints:
          - type: 'local'
            path: '${storage}/blocks/local'
          - type: 'url'
            url: 'https://block.registry.platforma.bio/'

  `
}

import { randomBytes } from 'crypto';
function randomStr(len: number) : string {
  return randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}
