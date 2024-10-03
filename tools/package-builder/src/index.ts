import { Build } from './commands/build';

import { Sign } from './commands/sign';
import SignPackages from './commands/sign/packages';

import { Publish } from './commands/publish';
import PublishDescriptor from './commands/publish/descriptors';
import PublishPackages from './commands/publish/packages';

import { default as GetPackageName } from './commands/get/package/name';
import { default as GetPackagePath } from './commands/get/package/path';
import { default as GetPackageVersion } from './commands/get/package/version';

// prettier-ignore
export const COMMANDS = {
  'build': Build,

  'sign': Sign,
  'sign packages': SignPackages,

  'publish': Publish,
  'publish descriptor': PublishDescriptor,
  'publish packages': PublishPackages,

  'get package name': GetPackageName,
  'get package path': GetPackagePath,
  'get package version': GetPackageVersion,
};
