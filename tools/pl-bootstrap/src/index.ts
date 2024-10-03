import Stop from './commands/stop';
import Reset from './commands/reset';

import Start from './commands/start';
import Docker from './commands/start/docker';
import S3 from './commands/start/docker/s3';
import Local from './commands/start/local';
import { default as LocalS3 } from './commands/start/local/s3';

import CreateBlock from './commands/create-block';

// prettier-ignore
export const COMMANDS = {
  'stop': Stop,
  'start': Start,
  'reset': Reset,
  'create-block': CreateBlock,
  'start docker': Docker,
  'start local': Local,
  'start docker s3': S3,
  'start local s3': LocalS3
};
