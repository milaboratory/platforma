import { Command } from 'commander';
import { version } from '../package.json' with { type: 'json' };
import { buildCommand } from './commands/build';
import { formatCommand } from './commands/format';
import { initConfigsCommand } from './commands/configs/init-configs';
import { initBuildConfigCommand } from './commands/configs/init-build-config';
import { initFmtConfigCommand } from './commands/configs/init-fmt-config';
import { initLintConfigCommand } from './commands/configs/init-lint-config';
import { initServeConfigCommand } from './commands/configs/init-serve-config';
import { initTsconfigCommand } from './commands/configs/init-tsconfig';
import { lintCommand } from './commands/lint';
import { serveCommand } from './commands/serve';
import { typesCommand } from './commands/types';

const program = new Command();

program
  .name('builder')
  .description('Universal build tool for the monorepo packages')
  .version(version);

program
  .option('--target <target>', 'Project target type (node|browser|browser-lib|block-model|block-ui|block-test)')
  .option('--build-config <path>', 'Path to build config file')
  .option('--serve-config <path>', 'Path to serve config file')
  .option('--use-sources', 'Use "sources" export condition for resolving packages');

program.addCommand(buildCommand);
program.addCommand(serveCommand);
program.addCommand(typesCommand);
program.addCommand(lintCommand);
program.addCommand(formatCommand);
program.addCommand(initConfigsCommand);
program.addCommand(initTsconfigCommand);
program.addCommand(initBuildConfigCommand);
program.addCommand(initServeConfigCommand);
program.addCommand(initLintConfigCommand);
program.addCommand(initFmtConfigCommand);

program.parse();
