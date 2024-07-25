import { resolve } from 'path';
import { readFileSync as fsReadFileSync, readdirSync } from "fs";

export function path(...p: string[]): string {
    return resolve(__dirname, "..", ...p)
}

export function dist(...p: string[]): string {
    return path("dist", ...p)
}

export function docker(...p: string[]): string {
    return path("docker", ...p)
}

export function composeFiles(): string[] {
    const dockerDirEntries = readdirSync(docker())
    return dockerDirEntries.filter((entry) => {
        return entry.endsWith(".yaml")
    }).map((value) => docker(value))
}

export function readFileSync(...p: string[]): Buffer {
    return fsReadFileSync(path(...p))
}

export type packageJson = {
    "pl-version": string
}

var _packageJson: packageJson

export function getPackageJson(): packageJson {
    if (!_packageJson) {
        _packageJson = JSON.parse(readFileSync("package.json").toString())
    }

    return _packageJson
}

export function plImageTag(version?: string): string {
    if (!version) {
        version = getPackageJson()['pl-version']
    }

    return `quay.io/milaboratories/platforma:${version}`
}
