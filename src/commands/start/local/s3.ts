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
    ...cmdOpts.StorageFlag,
    ...cmdOpts.ConfigFlag,
    ...cmdOpts.StoragePrimaryURLFlag,
    ...cmdOpts.StorageWorkPathFlag,
    ...cmdOpts.StorageLibraryURLFlag,
    ...cmdOpts.ConfigFlag,
    ...cmdOpts.PlLogFileFlag,
    ...cmdOpts.PlWorkdirFlag,
    ...cmdOpts.PlBinaryFlag,
    ...cmdOpts.AuthFlags,
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(FS)

    const logger = util.createLogger(flags['log-level'])
    const core = new Core(logger)

    const workdir = flags['pl-workdir'] ?? "."
    const storage = flags.storage ? path.resolve(workdir, flags.storage) : undefined
    const logFile = flags['pl-log-file'] ? path.resolve(workdir, flags['pl-log-file']) : 'stdout'

    const authDrivers = flagsToAuthDriversList(flags, workdir)

    const startOptions: startLocalOptions = {
      binaryPath: flags['pl-binary'],
      version: flags.version,
      configPath: flags.config,
      workdir: flags['pl-workdir'],

      primaryURL: flags['storage-primary'],
      libraryURL: flags['storage-library'],

      configOptions: {
        log: { path: logFile },
        localRoot: storage,
        core: {
          auth: { enabled: flags['auth-enabled'], drivers: authDrivers }
        },
        storages: {
          work: { type: 'FS', rootPath: flags['storage-work'], },
        }
      }
    }

    if (startOptions.binaryPath) {
      core.startLocalS3(startOptions)
    } else {
      platforma.getBinary(logger, { version: flags.version }).
        then(() => core.startLocalS3(startOptions))
    }
  }
}

export function flagsToAuthDriversList(flags: {
  'auth-htpasswd-file'?: string,

  'auth-ldap-server'?: string,
  'auth-ldap-default-dn'?: string,
}, workdir: string): types.authDriver[] | undefined {
  var authDrivers: types.authDriver[] = []
  if (flags['auth-htpasswd-file']) {
    authDrivers.push({
      driver: 'htpasswd',
      path: path.resolve(workdir, flags['auth-htpasswd-file']),
    })
  }
  if (flags['auth-ldap-server']) {
    if (!flags['auth-ldap-default-dn']) {
      throw new Error("LDAP auth also requires 'default DN' option to be set")
    }

    authDrivers.push({
      driver: 'ldap',
      serverUrl: flags['auth-ldap-server'],
      defaultDN: flags['auth-ldap-default-dn'],
    })
  }

  if (authDrivers.length === 0) {
    return undefined
  }

  return [
    { driver: 'jwt', key: util.randomStr(32) },
    ...authDrivers,
  ] as types.authDriver[]
}
