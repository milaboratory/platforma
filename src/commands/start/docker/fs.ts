import { Command, Flags } from '@oclif/core'
import * as pkg from '../../../package'
import { mkdirSync } from 'fs'
import { resolve, join } from 'path'
import { runDocker } from '../../../run'
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
    const image = flags.image ?? pkg.plImageTag(flags.version)
    const storage = resolve(flags.storage)

    for (const dir of [
      join(storage, "controllers", "file", "primary"),
      join(storage, "controllers", "file", "library"),
      join(storage, "controllers", "file", "work"),
      join(storage, "controllers", "runner", "software"),
    ]) {
      mkdirSync(dir, { recursive: true })
    }

    const child = runDocker(
      ['compose', `--file=${composeFSPath}`,
        'up',
        '--detach',
        '--remove-orphans',
        '--pull=missing',
        'backend'],
      {
        env: {
          "PL_IMAGE": image,
          "PL_STORAGE_PATH": storage
        },
        stdio: 'inherit'
      },
      {
        plImage: image,
        composePath: composeFSPath,
        storageDir: storage
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
