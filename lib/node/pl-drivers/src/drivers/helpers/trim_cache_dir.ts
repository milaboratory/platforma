import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { MiLogger } from "@milaboratories/ts-helpers";

/** Deletes the oldest entries (by mtime) of a cache directory until its total size fits `maxBytes`.
 * FilesCache tracks sizes in memory only, so entries left by earlier sessions are never counted
 * or evicted; run this before any driver uses the directory. Never throws: a failed trim must not
 * block startup. */
export async function trimCacheDir(logger: MiLogger, dir: string, maxBytes: number): Promise<void> {
  try {
    const entries = await listEntries(dir);
    let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (totalBytes <= maxBytes) return;

    const before = totalBytes;
    entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const entry of entries) {
      if (totalBytes <= maxBytes) break;
      await fsp.rm(entry.path, { recursive: true, force: true });
      totalBytes -= entry.size;
    }

    logger.info(`trimmed cache dir ${dir}: ${before} -> ${totalBytes} bytes (limit ${maxBytes})`);
  } catch (e: unknown) {
    logger.warn(`failed to trim cache dir ${dir}: ${String(e)}`);
  }
}

type CacheEntry = { path: string; size: number; mtimeMs: number };

async function listEntries(dir: string): Promise<CacheEntry[]> {
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch (e: unknown) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") return [];
    throw e;
  }

  return await Promise.all(
    names.map(async (name) => {
      const entryPath = path.join(dir, name);
      const stat = await fsp.stat(entryPath);
      const size = stat.isDirectory() ? await dirSize(entryPath) : stat.size;
      return { path: entryPath, size, mtimeMs: stat.mtimeMs };
    }),
  );
}

async function dirSize(dir: string): Promise<number> {
  const dirents = await fsp.readdir(dir, { withFileTypes: true });
  const sizes = await Promise.all(
    dirents.map(async (dirent) => {
      const entryPath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) return await dirSize(entryPath);
      return (await fsp.stat(entryPath)).size;
    }),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}
