import { readdirSync, statSync, existsSync, mkdirSync, stat } from 'fs';
import { createHash, Hash } from 'crypto';
import * as path from 'path';
import { start } from 'repl';

export function assertNever(a : never) {}

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

export function findPackageRoot(startPath?: string) : string {
    if (!startPath) {
        startPath = process.cwd()
    }

    const packageFileName = "package.json"

    return searchPathUp(startPath, startPath, packageFileName)
}

function searchPathUp(startPath: string, pathToCheck: string, itemToCheck: string) : string {
    const itemPath = path.resolve(pathToCheck, itemToCheck)

    if (existsSync(itemPath)) {
        return pathToCheck
    }

    const parentDir = path.dirname(pathToCheck)
    if (parentDir === pathToCheck || pathToCheck === "") {
        throw new Error (`failed to find '${itemToCheck}' file in any of parent directories starting from '${startPath}'`)
    }

    return searchPathUp(startPath, parentDir, itemToCheck)
}
