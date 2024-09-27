import { Command } from '@oclif/core';
import { createLogger } from '../compiler/main';
import { dumpAll } from '../shared/dump';
import { GlobalFlags } from '../shared/basecmd';
import { spawnEmbed, waitFor } from '../shared/proc';
import { TengoTesterBinaryPath } from '@milaboratories/tengo-tester';

export default class Check extends Command {
  static override description = 'check tengo sources for language processor an';

  // static override args = {
  //   "log-level": Args.string({description: 'logging level'}),
  // }

  static strict = false;

  static override flags = { ...GlobalFlags };

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  public async run(): Promise<void> {
    const { flags, argv } = await this.parse(Check);
    const logger = createLogger(flags['log-level']);

    const testerArgs: string[] = argv.length == 0 ? ['./src'] : (argv as string[]);

    // prettier-ignore
    const tester = spawnEmbed(
      TengoTesterBinaryPath,
      'check', '--log-level', flags['log-level'],
      '--artifacts', '-',
      ...testerArgs
    )

    try {
      dumpAll(logger, tester.stdin);
    } catch (err: unknown) {
      logger.error(err);
    } finally {
      tester.stdin.end();
      const code = await waitFor(tester);
      process.exit(code);
    }
  }
}
