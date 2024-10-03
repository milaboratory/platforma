import Cmd0 from './build-meta';
import Cmd1 from './build-model';
import Cmd3 from './pack';
import Cmd4 from './publish';
import Cmd5 from './upload-package-v1';

// prettier-ignore
export const COMMANDS = {
  'build-meta': Cmd0,
  'build-model': Cmd1,
  'pack': Cmd3,
  'publish': Cmd4,
  'upload-package-v1': Cmd5
};
