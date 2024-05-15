import { spawn } from 'child_process';
import { Command, Args } from '@oclif/core'
import { createLogger } from '../compiler/main'
import { dumpAll } from '../shared/dump';
import { FlagInput } from '@oclif/core/lib/interfaces/parser';

export default class Check extends Command {
  static override description = 'check tengo sources for language processor an'

  // static override args = {
  //   "log-level": Args.string({description: 'logging level'}),
  // }

  static strict = false

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const testerArgs: string[] = (this.argv.length == 0) ? ['./src'] : this.argv

    const tester = spawn(
      'npx', ['tgo-test', 'check', '--artifacts', '-', ...testerArgs],
      { stdio: ['pipe', process.stdout, process.stderr] });

    tester.stdin.on('error', (err: any) => {
      if (err.code === 'EPIPE') {
        // ignore EPIPE error as it stands for broken command run. 
        // The command will write normal problem description by itself.
      }
    });

    const logger = createLogger('error');
    dumpAll(logger, tester.stdin)
    tester.stdin.end()
  }
}
