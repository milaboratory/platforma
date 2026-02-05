import { Command } from 'commander';
import { version } from '../package.json' with { type: 'json' };
import { buildCommand } from './commands/build';
import { formatCommand } from './commands/format';
import { initBuildConfigCommand } from './commands/init-build-config';
import { initServeConfigCommand } from './commands/init-serve-config';
import { initTsconfigCommand } from './commands/init-tsconfig';
import { lintCommand } from './commands/lint';
import { serveCommand } from './commands/serve';
import { typesCommand } from './commands/types';

const program = new Command();

program
  .name('builder')
  .description('Universal build tool for the monorepo packages')
  .version(version);

program
  .requiredOption('--target <target>', 'Project target type (node|browser|browser-lib|block-model|block-ui|block-test)')
  .option('--build-config <path>', 'Path to build config file')
  .option('--serve-config <path>', 'Path to serve config file')
  .option('--use-sources', 'Use "sources" export condition for resolving packages');

program.addCommand(buildCommand);
program.addCommand(serveCommand);
program.addCommand(typesCommand);
program.addCommand(lintCommand);
program.addCommand(formatCommand);
program.addCommand(initTsconfigCommand);
program.addCommand(initBuildConfigCommand);
program.addCommand(initServeConfigCommand);

program.parse();
