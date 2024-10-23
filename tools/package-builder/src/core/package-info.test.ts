import * as artifacts from './test-artifacts'
import { PackageInfo } from './package-info'
import { createLogger } from './util'

test("PackageInfo loads correctly for multi-package", () => {
    const l = createLogger('error')

    const i = new PackageInfo(l, {
        pkgJsonData: artifacts.PackageJson,
    })

    var pkg = i.getPackage("pAsset")
    expect(pkg.registry.name).toEqual(artifacts.BinaryRegistry)
    expect(pkg.name).toEqual(artifacts.PackageNameNoAt + "/pAsset")
    expect(pkg.version).toEqual(artifacts.PackageVersion)
    expect(pkg.root).toEqual("./src")

    var pkg = i.getPackage(artifacts.EPNameCustomName)
    expect(pkg.registry.name).toEqual(artifacts.BinaryRegistry)
    expect(pkg.name).toEqual(artifacts.BinaryCustomName1)
    expect(pkg.version).toEqual(artifacts.BinaryCustomVersion)

    var pkg = i.getPackage("pEnv")
    expect(pkg.registry.name).toEqual(artifacts.BinaryRegistry)
    expect(pkg.name).toEqual(artifacts.PackageNameNoAt + "/pEnv")
    expect(pkg.version).toEqual(artifacts.PackageVersion)
})

test("PackageInfo considers version override", () => {
    const l = createLogger('error')

    const i = new PackageInfo(l, {
        pkgJsonData: artifacts.PackageJson,
    })

    const customVersion = "my-custom-version"
    i.version = customVersion

    var pkg = i.getPackage("pAsset")
    expect(pkg.version).toEqual(customVersion)

    var pkg = i.getPackage(artifacts.EPNameCustomName)
    expect(pkg.version).toEqual(customVersion)

    var pkg = i.getPackage("pEnv")
    expect(pkg.version).toEqual(customVersion)

    var pkg = i.getPackage("pEnvDep")
    expect(pkg.version).toEqual(customVersion)
})
