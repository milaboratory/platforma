import * as path from 'path';
import * as os from 'os';
import fs from 'fs';
import { createHash, Hash } from 'crypto';
import winston from 'winston';

export const packageJsonName = "package.json"
export const plPackageYamlName = "pl.package.yaml"

export function assertNever(a: never) {
    throw new Error("code logic error: assertNever() call")
}

export function trimPrefix(str: string, prefix: string): string {
    if (str.startsWith(prefix)) {
        return str.slice(prefix.length);
    }
    return str;
}

export function hashDirMetaSync(folder: string, hasher?: Hash): Hash {
    const hash = hasher ? hasher : createHash('sha256');
    const info = fs.readdirSync(folder, { withFileTypes: true });

    for (let item of info) {
        const fullPath = path.join(folder, item.name);

        if (item.isFile()) {
            const statInfo = fs.statSync(fullPath);
            const fileInfo = `${fullPath}:${statInfo.size}:${statInfo.mtimeMs}`;
            hash.update(fileInfo);
        } else if (item.isDirectory()) {
            hashDirMetaSync(fullPath, hash);
        }
    }

    return hash
}

export function hashDirSync(rootDir: string, hasher?: Hash, subdir?: string): Hash {
    const hash = hasher ? hasher : createHash('sha256');
    const folder = path.join(rootDir, subdir ?? ".")

    const info = fs.readdirSync(folder, { withFileTypes: true });

    for (let item of info) {
        const relPath = path.join(subdir ?? ".", item.name)
        const fullPath = path.join(folder, item.name);

        hash.update(relPath);

        if (item.isFile()) {
            const fileDescriptor = fs.openSync(fullPath, 'r');
            const buffer = Buffer.alloc(65536);
            let bytesRead: number;

            while ((bytesRead = fs.readSync(fileDescriptor, buffer, 0, buffer.length, null)) !== 0) {
                hash.update(buffer.subarray(0, bytesRead));
            }

            fs.closeSync(fileDescriptor);
        } else if (item.isDirectory()) {
            hashDirSync(fullPath, hash);
        }
    }

    return hash
}

//
// Creates all intermediate directories down to given <dirPath>.
// 
export function ensureDirsExist(dirPath: string) {
    if (fs.existsSync(dirPath)) {
        return;
    }
    const parentDir = path.dirname(dirPath);
    ensureDirsExist(parentDir);
    fs.mkdirSync(dirPath);
}

export function findPackageRoot(logger: winston.Logger, startPath?: string): string {
    if (!startPath) {
        startPath = process.cwd()
    }
    logger.debug(`Detecting package root...`)
    const pkgRoot = searchPathUp(startPath, startPath, packageJsonName)
    logger.debug(`  package root found at '${pkgRoot}'`)

    return pkgRoot
}

export function findNodeModules(logger: winston.Logger, startPath?: string): string {
    if (!startPath) {
        startPath = process.cwd()
    }
    logger.debug(`Detecting 'node_modules' directory...`)
    const nodeModules = searchPathUp(startPath, startPath, 'node_modules')
    logger.debug(`  'node_modules' found at '${nodeModules}'`)

    return path.join(nodeModules, 'node_modules')
}

export function findInstalledModule(logger: winston.Logger, packageName: string, startPath?: string): string {
    const nodeModules = findNodeModules(logger, startPath)
    const packagePath = path.resolve(nodeModules, packageName)

    if (!fs.existsSync(packagePath)) {
        throw new Error(`package '${packageName}' not found in '${nodeModules}'. Did you forget to add it as a dependency?`)
    }

    return packagePath
}

function searchPathUp(startPath: string, pathToCheck: string, itemToCheck: string): string {
    const itemPath = path.resolve(pathToCheck, itemToCheck)

    if (fs.existsSync(itemPath)) {
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

        format: winston.format.combine(
            winston.format.printf(({ level, message }) => {
                const indent = ' '.repeat(level.length + 2);  // For ': ' after the level
                const indentedMessage = message.split('\n').map(
                    (line: string, index: number) => index === 0 ? line : indent + line
                ).join('\n');

                const colorize = (l: string) => winston.format.colorize().colorize(l, l)

                return `${colorize(level)}: ${indentedMessage}`;
            }),
        ),

        transports: [
            new winston.transports.Console({
                stderrLevels: ['error', 'warn', 'info', 'debug'],
                handleExceptions: true
            })
        ]
    });
}

export function rSplit(input: string, delimiter: string, limit?: number): string[] {
    const parts = input.split(delimiter);
    if (!limit || parts.length <= limit) {
        return parts;
    }

    return [
        parts.slice(0, -limit + 1).join(delimiter),
        ...parts.slice(-limit + 1)
    ];
};

export const OSes = ['linux', 'macosx', 'windows'] as const;
export type OSType = (typeof OSes)[number];

export function currentOS(): OSType {
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

export const AllSoftwareSources = ['binary'] as const; // add 'docker', '<whatever>' here when supported
export type SoftwareSource = (typeof AllSoftwareSources)[number];

export type BuildMode = 'dev-local' | 'release'
