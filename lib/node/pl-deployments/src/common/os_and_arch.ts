import os from 'os';

export const OSes = ['linux', 'macos', 'windows'] as const;
export type OSType = (typeof OSes)[number];

/** @param osName - should be the thing returned from either {@link os.platform())} or `uname -s` */
export function newOs(osName: string): OSType {
  switch (osName.toLowerCase()) {
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    case 'win32':
      return 'windows';
    default:
      throw new Error(
        `operating system '${osName}' is not currently supported by Platforma ecosystem. The list of OSes supported: `
        + JSON.stringify(OSes),
      );
  }
}

export const Arches = ['amd64', 'arm64'] as const;
export type ArchType = (typeof Arches)[number];

/** @param arch - should be the thing returned from either {@link os.arch())} or `uname -m` */
export function newArch(arch: string): ArchType {
  switch (arch) {
    case 'aarch64':
    case 'aarch64_be':
    case 'arm64':
      return 'arm64';

    case 'x86_64':
    case 'x64':
      return 'amd64';

    default:
      throw new Error(
        `processor architecture '${arch}' is not currently supported by Platforma ecosystem. The list of architectures supported: `
        + JSON.stringify(Arches),
      );
  }
}
