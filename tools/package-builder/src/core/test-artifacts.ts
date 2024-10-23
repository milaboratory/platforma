

export const PackageVersion: string = '1.2.3'
export const PackageNameNoAt: string = 'some-company/the-software'
export const PackageName: string = '@' + PackageNameNoAt

export const BinaryRegistry: string = "some-binary-registry"
export const BinaryCustomName1: string = "custom-package-name-1"
export const BinaryCustomVersion: string = "4.4.4"

export const EPNameAsset: string = "asset"
export const EPNameCustomName: string = "custom-name"
export const EPNameJavaEnvironment: string = "java-test-entrypoint"
export const EPNameJavaDependency: string = "java-dep"

export const PackageJsonNoSoftware = `{
    "name": "${PackageName}",
    "version": "${PackageVersion}"
}`

export const AssetArtifact = `{
  "type": "asset",
  "registry": "${BinaryRegistry}",
  "root": "./src"
}`

export const CustomVersionArtifact = `{
  "registry": {
    "name": "${BinaryRegistry}"
  },
  "name": "${BinaryCustomName1}",
  "version": "${BinaryCustomVersion}",

  "type": "binary",
  "root": "./src"
}`

export const EnvironmentDependencyPackage = `{
  "registry": {
    "name": "${BinaryRegistry}"
  },

  "root": "./src",
  "type": "java",
  "environment": ":${EPNameJavaEnvironment}"
}`

export const EnvironmentPackage = `{
  "registry": {
    "name": "${BinaryRegistry}"
  },

  "type": "environment",
  "runtime": "java",
  "root": "./src",
  "binDir": "."
}`

export const PackageJson = `{
    "name": "${PackageName}",
    "version": "${PackageVersion}",
    "block-software": {
      "artifacts": {
        "pAsset": ${AssetArtifact},
        "pEnv": ${EnvironmentPackage},
        "pEnvDep": ${EnvironmentDependencyPackage}
      },
      "entrypoints": {
        "${EPNameAsset}": {
          "asset": "pAsset"
        },
        "${EPNameCustomName}": {
          "binary": {
            "artifact": ${CustomVersionArtifact},
            "cmd": ["aaaa"]
          }
        },
        "${EPNameJavaEnvironment}": {
          "environment": { "artifact": "pEnv" }
        },
        "${EPNameJavaDependency}": {
          "binary": {
            "artifact": "pEnvDep",
            "cmd": ["aaaa"]
          }
        }
      }
    }
}`

// export const PlPackageYamlCustomSettings: string = `
// docker:
//   registry: "${PlDockerRegistry}"
//   name: "${PlDockerImageName}"
//   version: "${PlDockerCustomVersion}"
//   entrypoint: [ "/usr/bin/env", "printf" ]
//   cmd: [ "Hello, world!" ]

// binary:
//   registry:
//     name: "${PlBinaryRegistry}"
//   name: "${PlBinaryCustomName}"
//   version: "${PlBinaryCustomVersion}"
//   root: ./src
//   cmd: ./script1.py
//   runEnv: python@3.12
//   requirements: ./requirements.txt
// `
