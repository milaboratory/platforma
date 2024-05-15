import { spawn } from 'child_process';
import { Command } from '@oclif/core'
import { createLogger } from '../compiler/main'
import { dumpAll } from '../shared/dump';

export default class Test extends Command {
  static override description = 'run tengo unit tests (.test.tengo)'

  static strict = false

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const testerArgs: string[] = (this.argv.length == 0) ? ['./src'] : this.argv

    const tester = spawn(
      'npx', ['tgo-test', 'run', '--artifacts', '-', ...testerArgs],
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
