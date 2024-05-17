import { Command } from '@oclif/core'
import { createLogger } from '../compiler/main'
import { dumpAll } from '../shared/dump';
import { GlobalFlags } from '../shared/basecmd';
import { spawnEmbed, waitFor } from '../shared/proc';

export default class Check extends Command {
  static override description = 'check tengo sources for language processor an'

  // static override args = {
  //   "log-level": Args.string({description: 'logging level'}),
  // }

  static strict = false

  static override flags = { ...GlobalFlags }

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const { flags } = await this.parse(Check)
    const logger = createLogger(flags['log-level'])

    const testerArgs: string[] = (this.argv.length == 0) ? ['./src'] : this.argv

    const tester = spawnEmbed(
      'npx', 'tgo-test', 'check',
      '--log-level', flags['log-level'],
      '--artifacts', '-',
      ...testerArgs
    )

    dumpAll(logger, tester.stdin)
    tester.stdin.end()

    const code = await waitFor(tester)
    process.exit(code)
  }
}
