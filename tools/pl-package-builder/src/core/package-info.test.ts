import * as artifacts from './test-artifacts'
import { PackageInfo } from './package-info'
import { createLogger } from './util'

test("PackageInfo loads correctly for multi-package", () => {
    const l = createLogger('error')

    const i = new PackageInfo(l, {
        pkgJsonData: artifacts.PackageJson,
    })

    var pkg = i.getPackage("pCross")
    expect(pkg.binary).toBeDefined()
    expect(pkg.binary!.registry.name).toEqual(artifacts.BinaryRegistry)
    expect(pkg.binary!.name).toEqual(artifacts.PackageNameNoAt)
    expect(pkg.binary!.version).toEqual(artifacts.PackageVersion)
    expect(pkg.binary!.root).toEqual("./src")

    var pkg = i.getPackage("pCustom")
    expect(pkg.binary).toBeDefined()
    expect(pkg.binary!.registry.name).toEqual(artifacts.BinaryRegistry)
    expect(pkg.binary!.name).toEqual(artifacts.BinaryCustomName)
    expect(pkg.binary!.version).toEqual(artifacts.BinaryCustomVersion)

    var pkg = i.getPackage("pEnv")
    expect(pkg.environment).toBeDefined()
    expect(pkg.environment!.registry.name).toEqual(artifacts.BinaryRegistry)
    expect(pkg.environment!.name).toEqual(artifacts.PackageNameNoAt)
    expect(pkg.environment!.version).toEqual(artifacts.PackageVersion)
})

test("PackageInfo considers version override", () => {
    const l = createLogger('error')

    const i = new PackageInfo(l, {
        pkgJsonData: artifacts.PackageJson,
    })

    const customVersion = "my-custom-version"
    i.version = customVersion

    var pkg = i.getPackage("pCross")
    expect(pkg.binary).toBeDefined()
    expect(pkg.binary!.version).toEqual(customVersion)

    var pkg = i.getPackage("pCustom")
    expect(pkg.binary).toBeDefined()
    expect(pkg.binary!.version).toEqual(customVersion)

    var pkg = i.getPackage("pEnv")
    expect(pkg.environment).toBeDefined()
    expect(pkg.environment!.version).toEqual(customVersion)

    var pkg = i.getPackage("pEnvDep")
    expect(pkg.binary).toBeDefined()
    expect(pkg.binary!.version).toEqual(customVersion)
})
