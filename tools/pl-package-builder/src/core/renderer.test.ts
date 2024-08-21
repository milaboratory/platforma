import fs from 'fs'
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';

import * as artifacts from './test-artifacts'
import { PackageInfo } from './package-info'
import { Renderer, readEntrypointDescriptor } from './renderer'
import { createLogger } from './util'

describe("Renderer tests", () => {
    let tempDir: string;
    let i: PackageInfo
    const l = createLogger('error')

    beforeAll(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-temp-dir-'))
    });

    beforeEach(() => {
        const fakePackageRoot = path.join(tempDir, randomBytes(16).toString('hex'))
        i = new PackageInfo(l, { pkgJsonData: artifacts.PackageJson, packageRoot: fakePackageRoot })
    })

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true });
    });

    test("render crossplatform", () => {
        const epName = artifacts.EPNameCrossplatform
        const sw = new Renderer(l, i.packageName, i.packageRoot)
        const descriptor = sw.renderSoftwareEntrypoints('release', i.getPackage("pCross"), { entrypoints: [epName] }).get(epName)!

        expect(descriptor.binary!.package).toEqual(`${artifacts.PackageNameNoAt}/${artifacts.PackageVersion}.tgz`)
    })

    test("render os-dependant", () => {
        const epName = artifacts.EPNameCustomName
        const sw = new Renderer(l, i.packageName, i.packageRoot)
        const descriptor = sw.renderSoftwareEntrypoints('release', i.getPackage("pCustom"), { entrypoints: [epName] }).get(epName)!

        expect(descriptor.binary!.package).toEqual(`${artifacts.BinaryCustomName1}/${artifacts.BinaryCustomVersion}-{os}-{arch}.tgz`)
    })

    test("render environment", () => {
        const epName = artifacts.EPNameJavaEnvironment
        const sw = new Renderer(l, i.packageName, i.packageRoot)
        const descriptor = sw.renderSoftwareEntrypoints('release', i.getPackage("pEnv"), { entrypoints: [epName] }).get(epName)!

        expect(descriptor.runEnv!.package).toEqual(`${artifacts.BinaryCustomName3}/${artifacts.PackageVersion}-{os}-{arch}.tgz`)
        expect(descriptor.runEnv!.type).toEqual("java")
        expect(descriptor.runEnv!.binDir).toEqual(".")
    })

    test("read descriptor after render", () => {
        const epName = artifacts.EPNameCrossplatform
        const sw = new Renderer(l, i.packageName, i.packageRoot)
        const renderedDescriptor = sw.renderSoftwareEntrypoints('release', i.getPackage("pCross"), { entrypoints: [epName] }).get(epName)!

        sw.writeEntrypointDescriptor(renderedDescriptor)

        const parsedDescriptor = readEntrypointDescriptor(i.packageName, i.packageRoot, epName)

        expect(parsedDescriptor.binary).toEqual(renderedDescriptor.binary)
    })

    test("render with environment dependency", () => {
        const envRenderer = new Renderer(l, i.packageName, i.packageRoot)
        const envDescriptor = envRenderer.renderSoftwareEntrypoints('release', i.getPackage("pEnv")).get(artifacts.EPNameJavaEnvironment)!
        envRenderer.writeEntrypointDescriptor(envDescriptor)

        const epName = artifacts.EPNameJavaDependency
        const sw = new Renderer(l, i.packageName, i.packageRoot)
        const descriptor = sw.renderSoftwareEntrypoints('release', i.getPackage("pEnvDep"), { entrypoints: [epName] }).get(epName)!

        expect(descriptor.binary!.package).toEqual(`${artifacts.BinaryCustomName2}/${artifacts.PackageVersion}.tgz`)
    })
})
