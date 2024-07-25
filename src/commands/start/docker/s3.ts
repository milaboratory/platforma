import { Command, Flags } from '@oclif/core'
import * as pkg from '../../../package'
import { runDocker } from '../../../run'
import state from '../../../state'

export default class S3 extends Command {
  static override description = 'Run platforma backend service with \'S3\' primary storage type'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static override flags = {
    image: Flags.string({ name: 'image', description: 'use custom docker image to run platforma' }),
    version: Flags.string({ name: 'version', description: 'use custom platforma release (official docker image of custom version)' })
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(S3)

    const composeS3Path = pkg.path("docker", "compose-s3.yaml")
    const image = flags.image ?? pkg.plImageTag(flags.version)

    const child = runDocker(
      ['compose', `--file=${composeS3Path}`,
        'up',
        '--detach',
        '--remove-orphans',
        '--pull=missing',
        'backend'],
      {
        env: {
          "PL_IMAGE": image,
        },
        stdio: 'inherit'
      },
      {
        plImage: image,
        composePath: composeS3Path
      }
    );

    child.on('exit', (code) => {
      if (code === 0) {
        state.isActive = true
      }

      process.exit(code ?? 0);
    });
  }
}
