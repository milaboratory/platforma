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

  // Sequential on purpose: a large leftover cache must not queue a stat per file at startup.
  const entries: CacheEntry[] = [];
  for (const name of names) {
    const entryPath = path.join(dir, name);
    // lstat: a dangling link inside an extracted archive must not abort the whole trim.
    const stat = await fsp.lstat(entryPath);
    const size = stat.isDirectory() ? await dirSize(entryPath) : stat.size;
    entries.push({ path: entryPath, size, mtimeMs: stat.mtimeMs });
  }
  return entries;
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  for (const dirent of await fsp.readdir(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, dirent.name);
    total += dirent.isDirectory() ? await dirSize(entryPath) : (await fsp.lstat(entryPath)).size;
  }
  return total;
}
