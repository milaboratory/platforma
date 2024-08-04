export const PlDockerRegistry: string = "some-docker-registry"
export const PlBinaryRegistry: string = "some-binary-registry"

export const PlPackageYamlDockerMinimal: string = `
docker:
  registry: "${PlDockerRegistry}"
`

export const PlPackageYamlBinaryMinimal: string = `
binary:
  registry:
    name: "${PlBinaryRegistry}"
  root: .
`

export const PlPackageYamlAllMinimal: string = `
docker:
  registry: "${PlDockerRegistry}"

binary:
  registry:
    name: "${PlBinaryRegistry}"
  root: .
`

export const PackageVersion: string = '1.2.3'
export const PackageName: string = '@some-company/the-software'

export const PackageJson = `
{
    "name": "${PackageName}",
    "version": "${PackageVersion}"
}
`
export const PlDockerImageName: string = "custom-docker-image-name"
export const PlDockerCustomVersion: string = "5.5.5"
export const PlBinaryCustomName: string = "custom-binary-package-name"
export const PlBinaryCustomVersion: string = "4.4.4"

export const PlPackageYamlCustomSettings: string = `
docker:
  registry: "${PlDockerRegistry}"
  name: "${PlDockerImageName}"
  version: "${PlDockerCustomVersion}"
  entrypoint: [ "/usr/bin/env", "printf" ]
  cmd: [ "Hello, world!" ]

binary:
  registry:
    name: "${PlBinaryRegistry}"
  name: "${PlBinaryCustomName}"
  version: "${PlBinaryCustomVersion}"
  root: ./src
  cmd: ./script1.py
  runEnv: python@3.12
  requirements: ./requirements.txt
`

export const PlPackageYamlCrossplatform: string = `
binary:
  registry:
    name: "${PlBinaryRegistry}"
  name: "${PlBinaryCustomName}"
  version: "${PlBinaryCustomVersion}"
  crossplatform: true

  root: ./src
`
