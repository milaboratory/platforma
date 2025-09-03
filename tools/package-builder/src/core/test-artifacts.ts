export const PackageVersion: string = '1.2.3';
export const PackageNameNoAt: string = 'the-software';
export const PackageName: string = '@' + PackageNameNoAt;

export const BinaryRegistry: string = 'some-binary-registry';
export const BinaryRegistryURL: string = 'http://example.com/registry';
export const BinaryCustomName1: string = 'custom-package-name-1';
export const BinaryCustomVersion: string = '4.4.4';

export const EPNameAsset: string = 'pAsset';
export const EPNameCustomName: string = 'custom-name';
export const EPNameJavaEnvironment: string = 'java-environment';
export const EPNameJava: string = 'java-package';
export const EPNameDocker: string = 'docker-test-entrypoint';

export const PackageJsonNoSoftware = `{
    "name": "${PackageName}",
    "version": "${PackageVersion}"
}`;

export const AssetArtifact = `{
  "type": "asset",
  "registry": "${BinaryRegistry}",
  "root": "./src"
}`;

export const CustomVersionArtifact = `{
  "registry": {
    "name": "${BinaryRegistry}"
  },
  "name": "${BinaryCustomName1}",
  "version": "${BinaryCustomVersion}",

  "type": "binary",
  "root": "./src"
}`;

export const JavaPackage = `{
  "registry": {
    "name": "${BinaryRegistry}"
  },

  "root": "./src",
  "type": "java",
  "environment": ":${EPNameJavaEnvironment}"
}`;

export const JavaEnvironmentPackage = `{
  "registry": {
    "name": "${BinaryRegistry}"
  },

  "type": "environment",
  "runtime": "java",
  "root": "./src",
  "binDir": "."
}`;

export const DockerAsset = `{
  "type": "docker",
  "tag": "some-docker-tag",
  "entrypoint": ["/usr/bin/env", "printf"],
  "cmd": ["Hello, world!"]
}`;

export const EPNameMultiRootBinary = 'multi-root-bin';

export const MultiRootBinary = `{
  "type": "binary",
  "registry": {
    "name": "${BinaryRegistry}"
  },

  "roots": {
    "linux-x64": "./linux-x64/",
    "macosx-aarch64": "./macosx-aarch64/"
  }
}`;

export const PackageJson = `{
    "name": "${PackageName}",
    "version": "${PackageVersion}",
    "block-software": {
      "registries": {
        "binary": {
          "${BinaryRegistry}": {"downloadURL": "${BinaryRegistryURL}"}
        }
      },
      "entrypoints": {
        "${EPNameAsset}": {
          "asset": ${AssetArtifact}
        },
        "${EPNameCustomName}": {
          "binary": {
            "artifact": ${CustomVersionArtifact},
            "cmd": ["aaaa"]
          }
        },
        "${EPNameMultiRootBinary}": {
          "binary": {
            "artifact": ${MultiRootBinary},
            "cmd": ["bbb"]
          }
        },
        "${EPNameJavaEnvironment}": {
          "environment": { "artifact": ${JavaEnvironmentPackage} }
        },
        "${EPNameJava}": {
          "binary": {
            "artifact": ${JavaPackage},
            "cmd": ["aaaa"]
          },
          "docker": {
            "artifact": {
              "type": "docker",
              "dockerfile": "Dockerfile",
              "context": "docker-context",
              "entrypoint": ["/usr/bin/env", "printf"]
            },
            "cmd": ["echo", "hello"]
          }
        },
        "${EPNameDocker}": {
          "docker": {
            "artifact": {
              "type": "docker",
              "dockerfile": "Dockerfile",
              "context": "docker-context",
              "entrypoint": ["/usr/bin/env", "printf"]
            },
            "cmd": ["echo", "hello"]
          }
        }
      }
    }
}`;

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
