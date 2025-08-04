import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { MiLogger } from './log';

export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.promises.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDirExists(fileOrDir: string) {
  if (!(await fileExists(fileOrDir))) {
    await fs.promises.mkdir(fileOrDir, { recursive: true });
  }
}

/** Create an new directory, or empty an existing one */
export async function emptyDir(dirPath: string) {
  await ensureDirExists(dirPath);

  const files = await fs.promises.readdir(dirPath);
  return Promise.all(files.map((file) => {
    const filePath = path.join(dirPath, file);
    return fs.promises.rm(filePath, { recursive: true, force: true });
  }));
}

/** Atomically creates a file or a directory, see:
 * https://yakking.branchable.com/posts/atomic-file-creation-tmpfile/
 * fillFileFn should use a syscall that will fail if the temporal file already exists, see (4) */
export async function createPathAtomically(
  logger: MiLogger,
  fPath: string,
  fillFileFn: (fPath: string) => Promise<void>,
) {
  const randomSuffix = crypto.randomBytes(8).toString('hex');
  const tempPath = `${fPath}.tmp.${randomSuffix}`;

  try {
    // Create a temp file with random suffix to prevent race conditions
    await fillFileFn(tempPath);

    // Rename atomically
    await fs.promises.rename(tempPath, fPath);
  } catch (e) {
    logger.error(`error while creating a file atomically: ${e instanceof Error ? e.message : String(e)}`);
    // Clean up temp file if it exists
    try {
      if (await fileExists(tempPath)) {
        await fs.promises.rm(tempPath, { recursive: true });
      }
    } catch (cleanupError) {
      logger.warn(`Failed to clean up temp file ${tempPath}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
    }
    throw e;
  }
}
