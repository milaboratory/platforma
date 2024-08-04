import { readdirSync, statSync, existsSync, mkdirSync, stat } from 'fs';
import { createHash, Hash } from 'crypto';
import * as path from 'path';
import * as tar from 'tar';
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

export function findPackageRoot(startPath?: string): string {
    if (!startPath) {
        startPath = process.cwd()
    }

    const packageFileName = "package.json"

    return searchPathUp(startPath, startPath, packageFileName)
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

export function packagePath(packageRootDir: string, packageName: string, packageVersion: string) : string {
    return path.resolve(packageRootDir, `pkg-${packageName}-${packageVersion}.tgz`)
}

export function packPackage(pkgContentRoot: string, dstArchivePath: string) {
    tar.c(
        {
            gzip: true,
            file: dstArchivePath,
            cwd: pkgContentRoot,
            sync: true
        },
        ['.']
    );
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
