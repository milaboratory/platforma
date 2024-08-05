import * as path from 'path';
import * as os from 'os';
import { readdirSync, statSync, existsSync, mkdirSync, stat } from 'fs';
import { createHash, Hash } from 'crypto';
import winston from 'winston';

export function assertNever(a: never) { }

export function hashDirMetaSync(folder: string, hasher?: Hash): Buffer {
    const hash = hasher ? hasher : createHash('sha256');
    const info = readdirSync(folder, { withFileTypes: true });

    for (let item of info) {
        const fullPath = path.join(folder, item.name);

        if (item.isFile()) {
            const statInfo = statSync(fullPath);
            const fileInfo = `${fullPath}:${statInfo.size}:${statInfo.mtimeMs}`;
            hash.update(fileInfo);
        } else if (item.isDirectory()) {
            hashDirMetaSync(fullPath, hash);
        }
    }

    return hash.digest();
}

//
// Creates all intermediate directories down to given <dirPath>.
// 
export function ensureDirsExist(dirPath: string) {
    if (existsSync(dirPath)) {
        return;
    }
    const parentDir = path.dirname(dirPath);
    ensureDirsExist(parentDir);
    mkdirSync(dirPath);
}

export function findPackageRoot(logger: winston.Logger, startPath?: string): string {
    if (!startPath) {
        startPath = process.cwd()
    }
    const packageFileName = "package.json"

    logger.debug(`Detecting package root...`)
    const pkgRoot = searchPathUp(startPath, startPath, packageFileName)
    logger.debug(`  package root found at '${pkgRoot}'`)

    return pkgRoot
}

function searchPathUp(startPath: string, pathToCheck: string, itemToCheck: string): string {
    const itemPath = path.resolve(pathToCheck, itemToCheck)

    if (existsSync(itemPath)) {
        return pathToCheck
    }

    const parentDir = path.dirname(pathToCheck)
    if (parentDir === pathToCheck || pathToCheck === "") {
        throw new Error(`failed to find '${itemToCheck}' file in any of parent directories starting from '${startPath}'`)
    }

    return searchPathUp(startPath, parentDir, itemToCheck)
}

export function createLogger(level: string = 'debug'): winston.Logger {
    return winston.createLogger({
        level: level,
        format: winston.format.printf(({ level, message }) => {
            return `${level.padStart(6, ' ')}: ${message}`;
        }),
        transports: [
            new winston.transports.Console({
                stderrLevels: ['error', 'warn', 'info', 'debug'],
                handleExceptions: true
            })
        ]
    });
}

export const OSes = ['linux', 'macosx', 'windows'] as const;
export type OStype = (typeof OSes)[number];

export function currentOS(): OStype {
    const platform = os.platform()
    switch (platform) {
        case 'darwin':
            return 'macosx';
        case 'linux':
            return 'linux';
        case 'win32':
            return 'windows';
        default:
            throw new Error(`operating system '${platform}' is not currently supported by Platforma ecosystem. The list of OSes supported: ` + JSON.stringify(OSes))
    }
}

export const Arches = ['x64', 'aarch64'] as const
export type ArchType = (typeof Arches)[number];

export function currentArch(): ArchType {
    const arch = os.arch()
    switch (arch) {
        case 'arm64':
            return 'aarch64'
        case 'x64':
            return 'x64'
        default:
            throw new Error(`processor architecture '${arch}' is not currently supported by Platforma ecosystem. The list of architectures supported: ` + JSON.stringify(Arches))
    }
}
