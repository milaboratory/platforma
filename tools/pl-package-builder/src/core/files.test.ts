import * as artifacts from './test-artifacts'
import {PackageInfo} from './files'

test("PackageInfo loads correctly on minimal required data", () => {
    const all = new PackageInfo(artifacts.PlPackageYamlAllMinimal, artifacts.PackageJson)

    expect(all.hasDocker).toBeTruthy()
    expect(all.docker.registry).toEqual(artifacts.PlDockerRegistry)
    expect(all.docker.name).toEqual(artifacts.PackageName.substring(1))
    expect(all.docker.version).toEqual(artifacts.PackageVersion)
    expect(all.docker.tag).toEqual(`${artifacts.PlDockerRegistry}/${artifacts.PackageName.substring(1)}:${artifacts.PackageVersion}`)
    
    expect(all.hasBinary).toBeTruthy()
    expect(all.binary.registry).toEqual(artifacts.PlBinaryRegistry)
    expect(all.binary.name).toEqual(artifacts.PackageName.substring(1))
    expect(all.binary.version).toEqual(artifacts.PackageVersion)

    const docker = new PackageInfo(artifacts.PlPackageYamlDockerMinimal, artifacts.PackageJson)
    expect(docker.hasDocker).toBeTruthy()
    expect(docker.docker).toEqual(all.docker)
    expect(docker.hasBinary).toBeFalsy()
    
    const binary = new PackageInfo(artifacts.PlPackageYamlBinaryMinimal, artifacts.PackageJson)
    expect(binary.hasDocker).toBeFalsy()
    expect(binary.hasBinary).toBeTruthy()
    expect(binary.binary).toEqual(all.binary)
})
