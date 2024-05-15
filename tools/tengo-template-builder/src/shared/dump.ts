import winston from 'winston';
import { getPackageInfo, newCompiler, parseSources } from '../compiler/main'

export function dumpAll(logger: winston.Logger, stream: NodeJS.WritableStream): void {
    const packageInfo = getPackageInfo()

    const sources = parseSources(logger, packageInfo, 'src', '')

    const compiler = newCompiler(logger, packageInfo)
    for (const src of sources) {
        if (src.fullName.type === "library") {
            compiler.addLib(src)
        }
    }

    // group output by type:
    //  - all libs
    //  - all templates
    //  - all tests

    for (const lib of compiler.allLibs()) {
        stream.write(JSON.stringify(lib) + "\n")
    }

    for (const src of sources) {
        if (src.fullName.type === 'template') {
            stream.write(JSON.stringify(src) + "\n")
        }
    }

    for (const src of sources) {
        if (src.fullName.type === 'test') {
            stream.write(JSON.stringify(src) + "\n")
        }
    }
}

export function dumpLibs(logger: winston.Logger, dumpDeps: boolean, stream: NodeJS.WritableStream): void {
    const packageInfo = getPackageInfo()

    const sources = parseSources(logger, packageInfo, 'src', '')

    if (!dumpDeps) {
        for (const src of sources) {
            if (src.fullName.type === "library") {
                stream.write(JSON.stringify(src) + "\n")
            }
        }

        return
    }

    const compiler = newCompiler(logger, packageInfo)
    for (const src of sources) {
        if (src.fullName.type === "library") {
            compiler.addLib(src)
        }
    }

    for (const lib of compiler.allLibs()) {
        stream.write(JSON.stringify(lib) + "\n")
    }
}

export function dumpTemplates(logger: winston.Logger, stream: NodeJS.WritableStream): void {
    const packageInfo = getPackageInfo()

    const sources = parseSources(logger, packageInfo, 'src', '')

    for (const src of sources) {
        if (src.fullName.type === "template") {
            stream.write(JSON.stringify(src) + "\n")
        }
    }
}

export function dumpTests(logger: winston.Logger, stream: NodeJS.WritableStream): void {
    const packageInfo = getPackageInfo()

    const sources = parseSources(logger, packageInfo, 'src', '')

    for (const src of sources) {
        if (src.fullName.type === 'test') {
            stream.write(JSON.stringify(src) + "\n")
        }
    }
}
