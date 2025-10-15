export const PackageVersion: string = '1.2.3';
export const PackageNameNoAt: string = 'the-software';
export const PackageName: string = '@' + PackageNameNoAt;

export const BinaryRegistry: string = 'some-binary-registry';
export const BinaryRegistryURL: string = 'http://example.com/registry';
export const BinaryCustomName1: string = 'custom-package-name-1';
export const BinaryCustomVersion: string = '4.4.4';

export const EPNameAsset: string = 'pAsset';
export const EPNameBinary: string = 'binary-package';
export const EPNameCustomName: string = 'custom-name';
export const EPNameJavaEnvironment: string = 'java-environment';
export const EPNamePythonEnvironment: string = 'python-environment';
export const EPNameREnvironment: string = 'R-environment';
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

export const BinaryArtifact = `{
  "registry": "platforma-open",

  "type": "binary",
  "roots": {
    "linux-x64": "./src/",
    "linux-aarch64": "./src/",
    "macosx-x64": "./src/",
    "macosx-aarch64": "./src/",
    "windows-x64": "./src/"
  }
}`;

export const CondaArtifact = `{
  "registry": "platforma-open",

  "type": "conda",
  "roots": {
    "linux-x64": "./src/",
    "linux-aarch64": "./src/",
    "macosx-x64": "./src/",
    "macosx-aarch64": "./src/",
    "windows-x64": "./src/"
  }
}`;

export const CondaArtifactWithSpec = `{
  "registry": "platforma-open",

  "type": "conda",
  "roots": {
    "linux-x64": "./src/",
    "linux-aarch64": "./src/",
    "macosx-x64": "./src/",
    "macosx-aarch64": "./src/",
    "windows-x64": "./src/"
  },
  'spec': './some-specification.yaml'
}`;

export const PythonArtifact = `{
  "registry": "platforma-open",
  "type": "python",
  "root": "./src",
  "environment": ":${EPNamePythonEnvironment}"
}`;

export const RArtifact = `{
  "registry": "platforma-open",
  "type": "R",
  "root": "./src",
  "environment": ":${EPNameREnvironment}"
}`;

export const CustomVersionArtifact = `{
  "registry": {
    "name": "${BinaryRegistry}"
  },
  "name": "${BinaryCustomName1}",
  "version": "${BinaryCustomVersion}",

  "type": "binary",
  "roots": {
    "linux-x64": "./src/",
    "linux-aarch64": "./src/",
    "macosx-x64": "./src/",
    "macosx-aarch64": "./src/",
    "windows-x64": "./src/"
  }
}`;

export const JavaArtifact = `{
  "registry": {
    "name": "${BinaryRegistry}"
  },

  "root": "./src",
  "type": "java",
  "environment": ":${EPNameJavaEnvironment}"
}`;

export const JavaEnvironmentArtifact = `{
  "registry": {
    "name": "${BinaryRegistry}"
  },

  "type": "environment",
  "runtime": "java",
  "roots": {
    "linux-x64": "./src/",
    "linux-aarch64": "./src/",
    "macosx-x64": "./src/",
    "macosx-aarch64": "./src/",
    "windows-x64": "./src/"
  },
  "binDir": "."
}`;

export const DockerArtifact = `{
  "type": "docker",
  "context": "./src"
}`;

export const DockerArtifactWithPkg = `{
  "type": "docker",
  "context": "./src",
  "pkg": "/app"
}`;

export const DockerArtifactWithDockerfile = `{
  "type": "docker",
  "context": "./src",
  "dockerfile": "some-dir/Dockerfile"
}`;

export const DockerAsset = `{
  "type": "docker",
  "tag": "some-docker-tag",
  "entrypoint": ["/usr/bin/env", "printf"],
  "cmd": ["Hello, world!"]
}`;

export const EPNameLimitedPlatformsBinary = 'multi-root-bin';

// This binary artifact intentionally has only part of roots, meaning
// software is not available for some platforms.
export const LimitedPlatformsBinary = `{
  "type": "binary",
  "registry": {
    "name": "${BinaryRegistry}"
  },

  "roots": {
    "linux-x64": "./linux-x64/",
    "macosx-aarch64": "./macosx-aarch64/"
  }
}`;

export const AssetEntrypoint = `{
  "asset": ${AssetArtifact}
}`;

export const BinaryEntrypoint = `{
  "binary": {
    "artifact": ${BinaryArtifact},
    "cmd": ["aaa"]
  }
}`;

export const BinaryEntrypointWithDocker = `{
  "binary": {
    "artifact": ${BinaryArtifact},
    "cmd": ["aaa"]
  },
  "docker": {
    "artifact": ${DockerArtifact},
    "cmd": ["aaa"]
  }
}`;

export const BinaryEntrypointWithReference = `{
  "binary": {
    "artifact": "binaryArtifactID",
    "cmd": ["aaa"]
  }
}`;

export const CustomBinaryEntrypoint = `{
  "binary": {
    "artifact": ${CustomVersionArtifact},
    "cmd": ["bbb"]
  }
}`;

export const LimitedPlatformsBinaryEntrypoint = `{
  "binary": {
    "artifact": ${LimitedPlatformsBinary},
    "cmd": ["bbb"]
  }
}`;

export const JavaEnvironmentEntrypoint = `{
  "environment": {
    "artifact": ${JavaEnvironmentArtifact}
  }
}`;

export const JavaEnvironmentEntrypointWithReference = `{
  "environment": {
    "artifact": "javaEnvironmentArtifactID"
  }
}`;

export const JavaEntrypoint = `{
  "binary": {
    "artifact": ${JavaArtifact},
    "cmd": ["java", "-jar", "hello.jar"]
  }
}`;

export const JavaEntrypointWithReference = `{
  "binary": {
    "artifact": "javaArtifactID",
    "cmd": ["java", "-jar", "hello.jar"]
  }
}`;

export const JavaEntrypointWithDocker = `{
  "binary": {
    "artifact": ${JavaArtifact},
    "cmd": ["java", "-jar", "hello.jar"]
  },
  "docker": {
    "artifact": ${DockerArtifact},
    "cmd": ["java", "-jar", "hello.jar"]
  }
}`;

export const PythonEntrypoint = `{
  "binary": {
    "artifact": ${PythonArtifact},
    "cmd": ["python", "hello.py"]
  }
}`;

export const PythonEntrypointWithReference = `{
  "binary": {
    "artifact": "pythonArtifactID",
    "cmd": ["python", "hello.py"]
  }
}`;

export const PythonEntrypointWithDocker = `{
  "binary": {
    "artifact": ${PythonArtifact},
    "cmd": ["python", "hello.py"]
  },
  "docker": {
    "artifact": ${DockerArtifact},
    "cmd": ["python", "hello.py"]
  }
}`;

export const REntrypoint = `{
  "binary": {
    "artifact": ${RArtifact},
    "cmd": ["Rscript", "hello.R"]
  }
}`;

export const REntrypointWithReference = `{
  "binary": {
    "artifact": "RArtifactID",
    "cmd": ["Rscript", "hello.R"]
  }
}`;

export const REntrypointWithDocker = `{
  "binary": {
    "artifact": ${RArtifact},
    "cmd": ["Rscript", "hello.R"]
  },
  "docker": {
    "artifact": ${DockerArtifact},
    "cmd": ["Rscript", "hello.R"]
  }
}`;

export const DockerEntrypoint = `{
  "docker": {
    "artifact": ${DockerArtifact},
    "cmd": ["echo", "hello"]
  }
}`;

export const DockerEntrypointWithReference = `{
  "docker": {
    "artifact": "dockerArtifactID",
    "cmd": ["echo", "hello"]
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
        "${EPNameAsset}":                  ${AssetEntrypoint},
        "${EPNameCustomName}":             ${CustomBinaryEntrypoint},
        "${EPNameLimitedPlatformsBinary}": ${LimitedPlatformsBinaryEntrypoint},
        "${EPNameJavaEnvironment}":        ${JavaEnvironmentEntrypoint},
        "${EPNameJava}":                   ${JavaEntrypointWithDocker},
        "${EPNameDocker}":                 ${DockerEntrypoint}
      }
    }
}`;

export const SingleBinaryackageJson = `{
  "name": "${PackageName}",
  "version": "${PackageVersion}",
  "block-software": {
    "entrypoints": {
      "${EPNameBinary}": {
        "binary": {
          "artifact": ${BinaryArtifact},
          "cmd": ["run-some-binary"]
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
