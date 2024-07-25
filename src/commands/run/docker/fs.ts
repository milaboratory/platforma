import { Command, Flags } from '@oclif/core'
import * as pkg from '../../../package'
import { mkdirSync } from 'fs'
import { resolve, join } from 'path'
import { runCompose } from '../../../run'
import state from '../../../state'


export default class FS extends Command {
  static override description = 'Run platforma backend service with \'FS\' primary storage type'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static override flags = {
    image: Flags.string({ name: 'image', description: 'use custom docker image to run platforma' }),
    version: Flags.string({ name: 'version', description: 'use custom platforma release (official docker image of custom version)' }),

    storage: Flags.string({
      name: 'storage',
      description: "specify path on host to be mounted to platforma docker container as storage",
      default: "./pl-storage",
    })
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(FS)

    const composeFSPath = pkg.path("docker", "compose-fs.yaml")
    const packageJson = pkg.getPackageJson()

    const version = flags.version ?? packageJson['pl-version']
    const image = flags.image ?? `quay.io/milaboratories/platforma:${version}`
    const storage = flags.storage

    for (const dir of [
      join(storage, "controllers", "file", "primary"),
      join(storage, "controllers", "file", "library"),
      join(storage, "controllers", "file", "work"),
      join(storage, "controllers", "runner", "software"),
    ]) {
      mkdirSync(dir, { recursive: true })
    }

    const child = runCompose(
      composeFSPath,
      ['up',
        '--detach',
        '--force-recreate',
        '--remove-orphans',
        '--pull=missing',
        'backend'
      ],
      {
        env: {
          "PL_IMAGE": image,
          "PL_STORAGE_PATH": resolve(storage)
        },
        stdio: 'inherit'
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
