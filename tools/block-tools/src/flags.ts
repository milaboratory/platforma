import { Flags } from '@oclif/core';
import path from 'node:path';

// export const registryFlag = Flags.custom<BlockRegistry>({
//   char: 'r',
//   summary: 'full address of the registry or alias from .pl.reg',
//   helpValue: '<address|alias>',
//   defaultHelp: 'default',
//   default: async () => (await getConfig()).createRegistry(),
//   parse: async (reg) => (await getConfig()).createRegistry(reg)
// });

export interface TargetFile {
  src: string;
  destName: string;
}

function parseTargetFile(arg: string): TargetFile {
  const match = arg.match(/(?<destName>[^\/\\]+)=(?<src>.*)/);
  if (match) {
    const { src, destName } = match.groups!;
    return { src, destName };
  } else {
    return { src: arg, destName: path.basename(arg) };
  }
}

export const targetFile = Flags.custom<TargetFile>({
  summary: 'target files to upload',
  helpValue: 'file_path | package_name=file_path',
  parse: async (arg) => parseTargetFile(arg)
});
