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

const merge = (data: string, patch: Record<string, unknown>): string => {
  const v = JSON.parse(data) as Record<string, unknown>;
  return JSON.stringify({ ...v, ...patch });
};

export const PackageJsonNoSoftware = `{
    "name": "${PackageName}",
    "version": "${PackageVersion}"
}`;

export const AssetArtifact = `{
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

  "roots": {
    "linux-x64": "./src/",
    "linux-aarch64": "./src/",
    "macosx-x64": "./src/",
    "macosx-aarch64": "./src/",
    "windows-x64": "./src/"
  }
}`;

export const CondaArtifactWithType = merge(CondaArtifact, { type: 'conda' });
export const CondaArtifactWithSpec = merge(CondaArtifactWithType, {
  spec: './some-specification.yaml',
});
export const CondaArtifactWithMicromambaVersion = merge(CondaArtifactWithSpec, {
  'micromamba-version': '2.3.2-0',
});

export const PythonArtifact = `{
  "type": "python",

  "registry": "platforma-open",
  "root": "./src",
  "environment": ":${EPNamePythonEnvironment}"
}`;

export const RArtifact = `{
  "type": "R",

  "registry": "platforma-open",
  "root": "./src",
  "environment": ":${EPNameREnvironment}"
}`;

export const CustomVersionArtifact = `{
  "type": "binary",

  "registry": {
    "name": "${BinaryRegistry}"
  },
  "name": "${BinaryCustomName1}",
  "version": "${BinaryCustomVersion}",

  "roots": {
    "linux-x64": "./src/",
    "linux-aarch64": "./src/",
    "macosx-x64": "./src/",
    "macosx-aarch64": "./src/",
    "windows-x64": "./src/"
  }
}`;

export const JavaArtifact = `{
  "type": "java",

  "registry": {
    "name": "${BinaryRegistry}"
  },

  "root": "./src",
  "environment": ":${EPNameJavaEnvironment}"
}`;

export const JavaEnvironmentArtifact = `{
  "runtime": "java",

  "registry": {
    "name": "${BinaryRegistry}"
  },

  "roots": {
    "linux-x64": "./src/",
    "linux-aarch64": "./src/",
    "macosx-x64": "./src/",
    "macosx-aarch64": "./src/",
    "windows-x64": "./src/"
  },
  "binDir": "."
}`;

export const JavaEnvironmentArtifactWithType = merge(JavaEnvironmentArtifact, { type: 'environment' });

export const DockerArtifact = `{
  "context": "./src"
}`;

export const DockerArtifactWithType = merge(DockerArtifact, { type: 'docker' });
export const DockerArtifactWithPkg = merge(DockerArtifactWithType, { pkg: '/app' });
export const DockerArtifactWithDockerfile = merge(DockerArtifactWithType, { dockerfile: 'Dockerfile' });

export const DockerAsset = `{
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

export const CondaEntrypoint = `{
  "conda": {
    "artifact": ${CondaArtifact},
    "cmd": ["python", "hello.py"]
  }
}`;

export const CondaEntrypointWithReference = `{
  "conda": {
    "artifact": "condaArtifactID",
    "cmd": ["ANARCI"]
  }
}`;

export const CondaEntrypointWithDocker = `{
  "conda": {
    "artifact": ${CondaArtifactWithMicromambaVersion},
    "cmd": ["ls"]
  },
  "docker": {
    "artifact": ${DockerArtifact},
    "cmd": ["ls"]
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
