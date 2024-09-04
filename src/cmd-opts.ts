import { Flags } from '@oclif/core'

export const GlobalFlags = {
    "log-level": Flags.string({
        description: "logging level",
        default: "info",
        options: ["error", "warn", "info", "debug"],
        required: false,
    })
}

export const ImageFlag = {
    image: Flags.string({
        description: 'use custom docker image to run platforma'
    })
}

export const VersionFlag = {
    version: Flags.string({
        description: 'use custom platforma release (official docker image or binary package)'
    })
}

export const LicenseFlag = {
  'license': Flags.string({
    description: 'pass a license code. The license can be got from "https://licensing.milaboratories.com".'
  })
}

export const LicenseFileFlag = {
  'license-file': Flags.file({
    exists: true,
    description: "specify a path to the file with a license. The license can be got from 'https://licensing.milaboratories.com'."
  })
}

export const StorageFlag = {
  storage: Flags.string({
    description: "specify path on host to be used as storage for all Platforma Backend data",
    })
}

export const PlLogFileFlag = {
    ['pl-log-file']: Flags.file({
        description: "specify path for Platforma Backend log file",
    })
}

export const PlWorkdirFlag = {
    ['pl-workdir']: Flags.file({
        description: "specify working directory for Platforma Backend process",
    })
}

export const PlBinaryFlag = {
    ['pl-binary']: Flags.file({
        description: "start given Platforma Backend binary instead of automatically downloaded version",
    })
}

export const PlSourcesFlag = {
    ['pl-sources']: Flags.file({
        description: "path to pl repository root: build Platforma Backend from sources and start the resulting binary",
    })
}

export const ConfigFlag = {
    config: Flags.string({
        description: "use custom Platforma Backend config",
    })
}

export const StoragePrimaryPathFlag = {
    'storage-primary': Flags.file({
        description: "specify path on host to be used as 'primary' storage",
    })
}

export const StorageWorkPathFlag = {
    'storage-work': Flags.file({
        description: "specify path on host to be used as 'work' storage",
    })
}

export const StorageLibraryPathFlag = {
    'storage-primary': Flags.file({
        description: "specify path on host to be used as 'library' storage",
    })
}

export const StoragePrimaryURLFlag = {
    'storage-primary': Flags.string({
        description: "specify 'primary' storage destination URL.\n" +
            "\tfile:/path/to/dir for directory on local FS\n" +
            "\ts3://<bucket>/?region=<name> for real AWS bucket\n" +
            "\ts3e://<endpoint>/<bucket>/?region=<name> for bucket behind custom endpoint via http\n" +
            "\ts3es://<endpoint>/<bucket>/?region=<name> for bucket behind custom endpoint via https"
    })
}

export const StorageLibraryURLFlag = {
    'storage-library': Flags.string({
        description: "specify 'library' storage destination URL.\n" +
            "\tfile:/path/to/dir for directory on local FS\n" +
            "\ts3://<bucket>/?region=<name> for real AWS bucket\n" +
            "\ts3e://<endpoint>/<bucket>/?region=<name> for bucket behind custom endpoint via http\n" +
            "\ts3es://<endpoint>/<bucket>/?region=<name> for bucket behind custom endpoint via https"
    })
}

export const AuthEnabledFlag = {
    'auth-enabled': Flags.boolean({
        description: 'enable authorization'
    })
}

export const HTPasswdFileFlag = {
    'auth-htpasswd-file': Flags.file({
        description: 'path to .htpasswd file with Platforma users (static user DB auth source)'
    })
}

export const LDAPAddressFlag = {
    'auth-ldap-server': Flags.string({
        description: 'address of LDAP server to use for auth in Platforma (auth source)'
    })
}

export const LDAPDefaultDNFlag = {
    'auth-ldap-default-dn': Flags.string({
        description: 'DN to use when checking user with LDAP bind operation: e.g. cn=%u,ou=users,dc=example,dc=com'
    })
}

export const AuthFlags = {
    ...AuthEnabledFlag,
    ...HTPasswdFileFlag,

    ...LDAPAddressFlag,
    ...LDAPDefaultDNFlag,
}
