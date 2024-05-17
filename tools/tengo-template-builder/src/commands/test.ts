import { Command } from '@oclif/core'
import { createLogger } from '../compiler/main'
import { dumpAll } from '../shared/dump';
import { GlobalFlags } from '../shared/basecmd';
import { spawnEmbed, waitFor } from '../shared/proc';

export default class Test extends Command {
  static override description = 'run tengo unit tests (.test.tengo)'

  static strict = false

  static override flags = { ...GlobalFlags }

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const {flags} = await this.parse(Test)
    const logger = createLogger(flags['log-level'])

    const testerArgs: string[] = (this.argv.length == 0) ? ['./src'] : this.argv
    const tester = spawnEmbed(
      'npx', 'tgo-test', 'run',
      '--log-level', flags['log-level'],
      '--artifacts', '-',
      ...testerArgs,
    )

    dumpAll(logger, tester.stdin)
    tester.stdin.end()

    const code = await waitFor(tester)
    process.exit(code)
  }
}
