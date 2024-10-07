import Cmd0 from './commands/build';
import Cmd1 from './commands/check';
import Cmd2 from './commands/test';
import Cmd3 from './commands/dump/all';
import Cmd4 from './commands/dump/libs';
import Cmd5 from './commands/dump/software';
import Cmd6 from './commands/dump/templates';
import Cmd7 from './commands/dump/tests';

// prettier-ignore
export const COMMANDS = {
  'build': Cmd0,
  'check': Cmd1,
  'test': Cmd2,
  'dump:all': Cmd3,
  'dump:libs': Cmd4,
  'dump:software': Cmd5,
  'dump:templates': Cmd6,
  'dump:tests': Cmd7
};
