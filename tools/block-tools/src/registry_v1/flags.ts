import { Option } from "commander";
import path from "node:path";

export interface TargetFile {
  src: string;
  destName: string;
}

function parseTargetFile(arg: string): TargetFile {
  const match = arg.match(/(?<destName>[^/\\]+)=(?<src>.*)/);
  if (match) {
    const { src, destName } = match.groups!;
    return { src, destName };
  } else {
    return { src: arg, destName: path.basename(arg) };
  }
}

// Repeatable `file_path | package_name=file_path` option.
export function targetFileOption(flags: string, summary: string): Option {
  return new Option(flags, summary)
    .argParser((arg: string, prev?: TargetFile[]) => [...(prev ?? []), parseTargetFile(arg)])
    .default([] as TargetFile[]);
}
