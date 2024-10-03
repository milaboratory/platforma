import Build from './build';
import Check from './check';
import Test from './test';

import DumpAll from './dump/all';
import DumpLibs from './dump/libs';
import DumpSoftware from './dump/software';
import DumpTemplates from './dump/templates';
import DumpTests from './dump/tests';

// prettier-ignore
export const COMMANDS = {
  build: Build,
  check: Check,
  test: Test,
  'dump all': DumpAll,
  'dump libs': DumpLibs,
  'dump software': DumpSoftware,
  'dump templates': DumpTemplates,
  'dump tests': DumpTests
};
