import { fileExists } from '@milaboratories/ts-helpers';
import fs from 'fs/promises';
import path from 'path';

export function filePid(dir: string) {
  return path.join(dir, 'pl_pid');
}

export async function readPid(filePath: string): Promise<number | undefined> {
  if (!(await fileExists(filePath))) {
    return undefined;
  }

  const text = await fs.readFile(filePath);

  return Number(text.toString());
}

export async function writePid(filePath: string, pid: number) {
  await fs.writeFile(filePath, JSON.stringify(pid));
}
