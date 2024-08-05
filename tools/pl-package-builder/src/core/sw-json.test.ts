import * as artifacts from './test-artifacts'
import { PackageInfo } from './package-info'
import { SoftwareDescriptor } from './sw-json'
import { createLogger } from './util'

test("software descriptor crossplatform", () => {
    const l = createLogger('error')

    const i = new PackageInfo(l, "", {
        plPkgYamlData: artifacts.PlPackageYamlCrossplatform,
        pkgJsonData: artifacts.PackageJson,
    })

    const sw = new SoftwareDescriptor(l, i)
    const descriptor = sw.render('release', ['binary'])

    expect(descriptor.binary!.package).toEqual(`${artifacts.PlBinaryCustomName}/${artifacts.PlBinaryCustomVersion}.tgz`)
})

test("software descriptor {os}-{arch}", () => {
    const l = createLogger('error')

    const i = new PackageInfo(l, "", {
        plPkgYamlData: artifacts.PlPackageYamlCustomSettings,
        pkgJsonData: artifacts.PackageJson,
    })

    const sw = new SoftwareDescriptor(l, i)
    const descriptor = sw.render('release', ['binary'])

    expect(descriptor.binary!.package).toEqual(`${artifacts.PlBinaryCustomName}/${artifacts.PlBinaryCustomVersion}-{os}-{arch}.tgz`)
})
