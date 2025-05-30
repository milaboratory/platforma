import { Flags } from '@oclif/core';
import * as util from './util';
import * as envs from './envs';

export const GlobalFlags = {
  'log-level': Flags.string({
    description: 'logging level',
    default: 'info',
    options: ['error', 'warn', 'info', 'debug'],
    required: false,
  }),
  'package-root': Flags.directory({
    description: 'path to directory with package.json file',
    required: false,
  }),
};

export const ForceFlag = {
  force: Flags.boolean({
    description: 'force action, ignoring automatic safety checks',
    default: false,
    required: false,
  }),
};

export const FailExistingPackagesFlag = {
  'fail-existing-packages': Flags.boolean({
    description: 'fail for package archives that already exist in registry',
    default: false,
    required: false,
  }),
};

const devModeValues = ['local'] as const;
export type devModeName = (typeof devModeValues)[number];

export const BuildFlags = {
  dev: Flags.string({
    env: envs.PL_PKG_DEV,
    description: 'build dev version of descriptor',
    options: devModeValues,
    required: false,
  }),
};

export const DirHashFlag = {
  'full-dir-hash': Flags.boolean({
    env: envs.PL_PKG_FULL_HASH,
    description:
      'when calculating software hash in dev=local mode, hash file contents instead of metadata.\n'
      + 'This makes descriptor file generation slower, but makes Platforma deduplication to work better, restarting'
      + ' calculations only when they readlly should be.',
    default: false,
  }),
};

export const EntrypointNameFlag = {
  entrypoint: Flags.string({
    description: 'build only selected entrypoints',
    multiple: true,
    required: false,
  }),
};

export const PackageIDFlag = {
  'package-id': Flags.string({
    description: 'build/publish only selected packages',
    required: false,
    multiple: true,
  }),
};

export const PackageIDRequiredFlag = {
  'package-id': Flags.string({
    description: 'build/publish only selected packages',
    required: true,
  }),
};

export const VersionFlag = {
  version: Flags.string({
    // env: envs.PL_PKG_VERSION, // !! this env is used 'globally' right inside package-info.ts !!
    description: 'override version of package to be built (ignore versions in package.json)',
    required: false,
  }),
};

export const PlatformFlags = {
  'platform': Flags.string({
    env: envs.PL_PKG_OS,
    description:
      '{os}-{arch} pair, supported by software. Has no effect on cross-platform software packages',
    options: util.AllPlatforms,
    required: false,
  }),

  'all-platforms': Flags.boolean({
    description: 'build/publish software packages for all platforms supported by these packages',
    required: false,
  }),
};

export const ArchiveFlag = {
  archive: Flags.file({
    env: envs.PL_PKG_ARCHIVE,
    description:
      'path to archive with the pacakge to be built/published. Overrides <os> and <arch> options',
    required: false,
  }),
};

export const StorageURLFlag = {
  'storage-url': Flags.string({
    env: envs.PL_PKG_STORAGE_URL,
    description:
      'publish package archive into given registry, specified by URL, e.g. s3://<bucket>/<some-path-prefix>?region=<region>',
    required: false,
  }),
};

export const ContentRootFlag = {
  'content-root': Flags.directory({
    env: envs.PL_PKG_CONTENT_ROOT,
    description:
      'path to directory with contents of software package. Overrides settings in package.json',
    required: false,
  }),
};

export const SourceFlag = {
  source: Flags.string({
    description:
      'add only selected sources to software entrypoint descriptor (*.sw.json file).\n'
      + '  - \'archive\': artifacts that are buildable into archive: assets, binary software, run environments.\n',
    options: util.AllSoftwareSources as unknown as string[],
    multiple: true,
    required: false,
  }),
};

export const SignFlags = {
  'sign-command': Flags.string({
    description:
      'command to use for signature creation.\n'
      + '\t{pkg} in argument is replaced with path to the package archive\n',
    required: false,
  }),
};

export function modeFromFlag(dev?: devModeName): util.BuildMode {
  switch (dev) {
    case 'local':
      return 'dev-local';

    case undefined:
      return 'release';

    default:
      util.assertNever(dev);
      throw new Error('unknown dev mode'); // just to calm down TS type analyzer
  }
}
