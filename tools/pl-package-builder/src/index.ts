import { Build } from './commands/build';
import { Publish } from './commands/publish';
import { Sign } from './commands/sign';

// prettier-ignore
export const COMMANDS = {
  'build': Build,
  'sign': Sign,
  'publish': Publish
};
