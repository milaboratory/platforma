

export const PackageVersion: string = '1.2.3'
export const PackageNameNoAt: string = 'some-company/the-software'
export const PackageName: string = '@'+PackageNameNoAt

export const BinaryRegistry: string = "some-binary-registry"
export const BinaryCustomName1: string = "custom-package-name-1"
export const BinaryCustomName2: string = "custom-package-name-2"
export const BinaryCustomName3: string = "custom-package-name-3"
export const BinaryCustomVersion: string = "4.4.4"

export const EPNameCrossplatform: string = "crossplatform"
export const EPNameCustomName: string = "custom-name"
export const EPNameJavaEnvironment: string = "java-test-entrypoint"
export const EPNameJavaDependency: string = "java-dep"

export const PackageJsonNoSoftware = `{
    "name": "${PackageName}",
    "version": "${PackageVersion}"
}`

export const CrossplatformPackage = `{
  "binary": {
    "registry": {
      "name": "${BinaryRegistry}"
    },
    "crossplatform": true,

    "root": "./src",

    "entrypoints": {
      "${EPNameCrossplatform}": { 
        "cmd": ["aaaa"]
      }
    }
  }
}`

export const CustomVersionPackage = `{
  "binary": {
    "registry": {
      "name": "${BinaryRegistry}"
    },
    "name": "${BinaryCustomName1}",
    "version": "${BinaryCustomVersion}",

    "root": "./src",

    "entrypoints": {
      "${EPNameCustomName}": {
        "cmd": ["aaaa"]
      }
    }
  }
}`

export const EnvironmentDependencyPackage = `{
  "binary": {
    "registry": {
      "name": "${BinaryRegistry}"
    },
    "name": "${BinaryCustomName2}",
    "crossplatform": true,

    "root": "./src",
    
    "type": "java",
    "environment": ":${EPNameJavaEnvironment}",

    "entrypoints": {
      "${EPNameJavaDependency}": {
        "cmd": ["aaaa"]
      }
    }
  }
}`

export const EnvironmentPackage = `{
  "environment": {
    "registry": {
      "name": "${BinaryRegistry}"
    },
    "name": "${BinaryCustomName3}",

    "type": "java",
    "root": "./src",
    "binDir": ".",
    
    "entrypointName": "${EPNameJavaEnvironment}"
  }
}`

export const PackageJson = `{
    "name": "${PackageName}",
    "version": "${PackageVersion}",
    "block-software": {
      "packages": {
        "pCross": ${CrossplatformPackage},
        "pCustom": ${CustomVersionPackage},
        "pEnv": ${EnvironmentPackage},
        "pEnvDep": ${EnvironmentDependencyPackage}
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
