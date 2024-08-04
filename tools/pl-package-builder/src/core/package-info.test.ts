import * as artifacts from './test-artifacts'
import { PackageInfo } from './package-info'
import { createLogger } from './util'

test("PackageInfo loads correctly on minimal required data", () => {
    const l = createLogger('error')

    const all = new PackageInfo(l, "", {
        plPkgYamlData: artifacts.PlPackageYamlAllMinimal,
        pkgJsonData: artifacts.PackageJson,
    })

    expect(all.hasDocker).toBeTruthy()
    expect(all.docker.registry).toEqual(artifacts.PlDockerRegistry)
    expect(all.docker.name).toEqual(artifacts.PackageName.substring(1))
    expect(all.docker.version).toEqual(artifacts.PackageVersion)
    expect(all.docker.tag).toEqual(`${artifacts.PlDockerRegistry}/${artifacts.PackageName.substring(1)}:${artifacts.PackageVersion}`)

    expect(all.hasBinary).toBeTruthy()
    expect(all.binary.registry).toEqual(artifacts.PlBinaryRegistry)
    expect(all.binary.name).toEqual(artifacts.PackageName.substring(1))
    expect(all.binary.version).toEqual(artifacts.PackageVersion)
    expect(all.binary.root).toEqual(".")

    const docker = new PackageInfo(l, "", {
        plPkgYamlData: artifacts.PlPackageYamlDockerMinimal,
        pkgJsonData: artifacts.PackageJson,
    })
    expect(docker.hasDocker).toBeTruthy()
    expect(docker.docker).toEqual(all.docker)
    expect(docker.hasBinary).toBeFalsy()

    const binary = new PackageInfo(l, "", {
        plPkgYamlData: artifacts.PlPackageYamlBinaryMinimal,
        pkgJsonData: artifacts.PackageJson,
    })
    expect(binary.hasDocker).toBeFalsy()
    expect(binary.hasBinary).toBeTruthy()
    expect(binary.binary).toEqual(all.binary)
})

test("PackageInfo considers custom version and package", () => {
    const l = createLogger('error')

    const i = new PackageInfo(l, "", {
        plPkgYamlData: artifacts.PlPackageYamlCustomSettings,
        pkgJsonData: artifacts.PackageJson,
    })

    expect(i.hasDocker).toBeTruthy()
    expect(i.docker.registry).toEqual(artifacts.PlDockerRegistry)
    expect(i.docker.name).toEqual(artifacts.PlDockerImageName)
    expect(i.docker.version).toEqual(artifacts.PlDockerCustomVersion)
    expect(i.docker.tag).toEqual(`${artifacts.PlDockerRegistry}/${artifacts.PlDockerImageName}:${artifacts.PlDockerCustomVersion}`)
    expect(i.docker.entrypoint).toEqual(["/usr/bin/env", "printf"])
    expect(i.docker.cmd).toEqual(["Hello, world!"])

    expect(i.hasBinary).toBeTruthy()
    expect(i.binary.registry).toEqual(artifacts.PlBinaryRegistry)
    expect(i.binary.name).toEqual(artifacts.PlBinaryCustomName)
    expect(i.binary.version).toEqual(artifacts.PlBinaryCustomVersion)
    expect(i.binary.root).toEqual("./src")
    expect(i.binary.cmd).toEqual("./script1.py")
    expect(i.binary.runEnv).toEqual("python@3.12")
    expect(i.binary.requirements).toEqual("./requirements.txt")
})
