import { Flags } from '@oclif/core';

export const GlobalFlags = {
  'log-level': Flags.string({
    description: 'logging level',
    default: 'info',
    options: ['error', 'warn', 'info', 'debug'],
    required: false,
  }),
};

export const InstanceName = {
  name: Flags.string({
    description: 'name of instance',
    required: false,
  }),
};

export const ImageFlag = {
  image: Flags.string({
    description: 'use custom docker image to run platforma',
  }),
};

export const VersionFlag = {
  version: Flags.string({
    description: 'use custom platforma release (official docker image or binary package)',
  }),
};

export const ArchFlag = {
  arch: Flags.string({
    description: 'override architecture. You can start amd64 linux image on arm-based host (say, Apple M family processor)',
    options: [
      'amd64',
      'arm64',
    ],
  }),
};

export const LicenseFlags = {
  'license': Flags.string({
    description: 'pass a license code. The license can be got from "https://licensing.milaboratories.com".',
  }),
  'license-file': Flags.file({
    exists: true,
    description:
      'specify a path to the file with a license. The license can be got from \'https://licensing.milaboratories.com\'.',
  }),
};

export const AddressesFlags = {
  'grpc-port': Flags.integer({
    description: 'port for Platforma Backend gRPC API. Default is 6345',
    env: 'PLATFORMA_GRPC_PORT',
  }),

  'grpc-listen': Flags.string({
    description: 'full listen addr for Platforma Backend gRPC API. Default is 127.0.0.1:6345',
    env: 'PLATFORMA_GRPC_LISTEN',
  }),

  'monitoring-port': Flags.integer({
    description: 'port for Platforma Backend monitoring API. Default is 9090',
    env: 'PLATFORMA_MONITORING_PORT',
  }),

  'monitoring-listen': Flags.string({
    description: 'full listen addr for Platforma Backend monitoring API. Default is 127.0.0.1:9090',
    env: 'PLATFORMA_MONITORING_LISTEN',
  }),

  'debug-port': Flags.integer({
    description: 'port for Platforma Backend debug API. Default is 9091',
    env: 'PLATFORMA_DEBUG_PORT',
  }),

  'debug-listen': Flags.string({
    description: 'full listen addr for Platforma Backend debug API. Default is 127.0.0.1:9091',
    env: 'PLATFORMA_DEBUG_LISTEN',
  }),
};

export const S3AddressesFlags = {
  's3-port': Flags.integer({
    description: 'port that S3 will listen, default is 9000',
    default: 9000,
    env: 'PLATFORMA_S3_PORT',
  }),

  's3-console-port': Flags.integer({
    description: 'port that a console of S3 will listen, default is 9001',
    default: 9001,
    env: 'PLATFORMA_S3_CONSOLE_PORT',
  }),
};

export const StorageFlag = {
  storage: Flags.string({
    description: 'specify path on host to be used as storage for all Platforma Backend data',
  }),
};

export const MinioPresignHostFlag = {
  ['minio-presign-host']: Flags.boolean({
    description: 'use \'minio\' host instead of \'localhost\' in presign URLs',
  }),
};

export const MountFlag = {
  mount: Flags.string({
    multiple: true,
    description: 'things to be mounted into platforma docker container. Targets will appear inside the container under the same absolute paths',
  }),
};

export const PlLogFileFlag = {
  ['pl-log-file']: Flags.file({
    description: 'specify path for Platforma Backend log file',
  }),
};

export const PlWorkdirFlag = {
  ['pl-workdir']: Flags.file({
    description: 'specify working directory for Platforma Backend process',
  }),
};

export const PlBinaryFlag = {
  ['pl-binary']: Flags.file({
    description: 'start given Platforma Backend binary instead of automatically downloaded version',
  }),
};

export const PlSourcesFlag = {
  ['pl-sources']: Flags.file({
    description: 'path to pl repository root: build Platforma Backend from sources and start the resulting binary',
  }),
};

export const ConfigFlag = {
  config: Flags.string({
    description: 'use custom Platforma Backend config',
  }),
};

export const StoragePrimaryPathFlag = {
  'storage-primary': Flags.file({
    description: 'specify path on host to be used as \'primary\' storage',
  }),
};

export const StorageWorkPathFlag = {
  'storage-work': Flags.file({
    description: 'specify path on host to be used as \'work\' storage',
  }),
};

export const StorageLibraryPathFlag = {
  'storage-primary': Flags.file({
    description: 'specify path on host to be used as \'library\' storage',
  }),
};

export const StoragePrimaryURLFlag = {
  'storage-primary': Flags.string({
    description:
      'specify \'primary\' storage destination URL.\n'
      + '\tfile:/path/to/dir for directory on local FS\n'
      + '\ts3://<bucket>/?region=<name> for real AWS bucket\n'
      + '\ts3e://<endpoint>/<bucket>/?region=<name> for bucket behind custom endpoint via http\n'
      + '\ts3es://<endpoint>/<bucket>/?region=<name> for bucket behind custom endpoint via https',
  }),
};

export const StorageLibraryURLFlag = {
  'storage-library': Flags.string({
    description:
      'specify \'library\' storage destination URL.\n'
      + '\tfile:/path/to/dir for directory on local FS\n'
      + '\ts3://<bucket>/?region=<name> for real AWS bucket\n'
      + '\ts3e://<endpoint>/<bucket>/?region=<name> for bucket behind custom endpoint via http\n'
      + '\ts3es://<endpoint>/<bucket>/?region=<name> for bucket behind custom endpoint via https',
  }),
};

export const AuthEnabledFlag = {
  'auth-enabled': Flags.boolean({
    description: 'enable authorization',
  }),
};

export const HTPasswdFileFlag = {
  'auth-htpasswd-file': Flags.file({
    description: 'path to .htpasswd file with Platforma users (static user DB auth source)',
  }),
};

export const LDAPAddressFlag = {
  'auth-ldap-server': Flags.string({
    description: 'address of LDAP server to use for auth in Platforma (auth source)',
  }),
};

export const LDAPDefaultDNFlag = {
  'auth-ldap-default-dn': Flags.string({
    description: 'DN to use when checking user with LDAP bind operation: e.g. cn=%u,ou=users,dc=example,dc=com',
  }),
};

export const AuthFlags = {
  ...AuthEnabledFlag,
  ...HTPasswdFileFlag,

  ...LDAPAddressFlag,
  ...LDAPDefaultDNFlag,
};
