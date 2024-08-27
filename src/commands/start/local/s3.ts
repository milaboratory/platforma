import { Command } from '@oclif/core'
import path from 'path'
import Core, { startLocalOptions } from '../../../core'
import * as cmdOpts from '../../../cmd-opts'
import * as platforma from '../../../platforma'
import * as util from '../../../util'
import * as types from '../../../templates/types'

export default class FS extends Command {
  static override description = 'Run Platforma Backend service as local process on current host (no docker container)'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static override flags = {
    ...cmdOpts.VersionFlag,

    ...cmdOpts.PlBinaryFlag,
    ...cmdOpts.PlSourcesFlag,

    ...cmdOpts.ConfigFlag,

    ...cmdOpts.StorageFlag,
    ...cmdOpts.StoragePrimaryURLFlag,
    ...cmdOpts.StorageWorkPathFlag,
    ...cmdOpts.StorageLibraryURLFlag,

    ...cmdOpts.PlLogFileFlag,
    ...cmdOpts.PlWorkdirFlag,
    ...cmdOpts.AuthFlags,
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(FS)

    const logger = util.createLogger(flags['log-level'])
    const core = new Core(logger)

    const workdir = flags['pl-workdir'] ?? "."
    const storage = flags.storage ? path.resolve(workdir, flags.storage) : undefined
    const logFile = flags['pl-log-file'] ? path.resolve(workdir, flags['pl-log-file']) : 'stdout'

    const authDrivers = core.initAuthDriversList(flags, workdir)
    const authEnabled = flags['auth-enabled'] ?? authDrivers !== undefined

    var binaryPath = flags['pl-binary']
    if (flags['pl-sources']) {
      binaryPath = core.buildPlatforma({ repoRoot: flags['pl-sources'] })
    }

    const startOptions: startLocalOptions = {
      binaryPath: binaryPath,
      version: flags.version,
      configPath: flags.config,
      workdir: flags['pl-workdir'],

      primaryURL: flags['storage-primary'],
      libraryURL: flags['storage-library'],

      configOptions: {
        log: { path: logFile },
        localRoot: storage,
        core: {
          auth: { enabled: authEnabled, drivers: authDrivers }
        },
        storages: {
          work: { type: 'FS', rootPath: flags['storage-work'] },
        }
      }
    }

    if (startOptions.binaryPath) {
      core.startLocalS3(startOptions)

    } else {
      platforma.getBinary(logger, { version: flags.version }).
        then(() => core.startLocalS3(startOptions)).
        catch(function (err: Error) { logger.error(err.message) })
    }
  }
}
