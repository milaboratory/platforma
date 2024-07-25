import { resolve } from 'path';
import { readFileSync as fsReadFileSync } from "fs";

export function path(...p: string[]) : string {
    return resolve(__dirname, "..", ...p)
}

export function dist(...p: string[]) : string {
    return path("dist", ...p)
}

export function docker(...p: string[]) : string {
    return path("docker", ...p)
}

export function readFileSync(...p: string[]) : Buffer { 
    return fsReadFileSync(path(...p))
}

export type packageJson = {
    "pl-version": string
}

var _packageJson: packageJson

export function getPackageJson() : packageJson {
    if (!_packageJson) {
        _packageJson = JSON.parse(readFileSync("package.json").toString())
    }

    return _packageJson
}
