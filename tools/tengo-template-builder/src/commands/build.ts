import {Args, Command, Flags} from '@oclif/core'
import { compile } from '../compiler/main'

export default class Build extends Command {
  static override description = 'describe the command here'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    compile()
  }
}
