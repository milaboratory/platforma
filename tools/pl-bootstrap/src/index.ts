import Cmd0 from './commands/create-block';
import Cmd1 from './commands/reset';
import Cmd2 from './commands/start';
import Cmd3 from './commands/stop';
import Cmd4 from './commands/start/docker';
import Cmd5 from './commands/start/local';
import Cmd6 from './commands/start/docker/s3';
import Cmd7 from './commands/start/local/s3';

// prettier-ignore
export const COMMANDS = {
  'create-block': Cmd0,
  'reset': Cmd1,
  'start': Cmd2,
  'stop': Cmd3,
  'start:docker': Cmd4,
  'start:local': Cmd5,
  'start:docker:s3': Cmd6,
  'start:local:s3': Cmd7
};
