import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { text } from "node:stream/consumers";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";

const fileTypeMask = 0o170000;
const symlinkType = 0o120000;
const directoryType = 0o040000;
const maxLinkTargetLength = 4096;
const dosHost = 0;
const dosDirectoryAttribute = 0x10;

/** Extracts a zip archive into `dstFolder`; throws on an entry or a symlink that leads outside it. */
export async function extractZip(
  archivePath: string,
  dstFolder: string,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await extractEntries(archivePath, dstFolder, signal);
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  }
}

async function extractEntries(
  archivePath: string,
  dstFolder: string,
  signal?: AbortSignal,
): Promise<void> {
  await fsp.mkdir(dstFolder, { recursive: true });
  const root = await fsp.realpath(dstFolder);
  const zip = await yauzl.openPromise(archivePath);

  for await (const entry of zip.eachEntry()) {
    signal?.throwIfAborted();
    const destination = path.join(root, entry.fileName);
    const parent = path.dirname(destination);
    const attributes = entry.externalFileAttributes >>> 16;
    await assertNoSymlinkOnPath(root, path.relative(root, destination), entry.fileName);

    const isDosDirectory =
      entry.versionMadeBy >> 8 === dosHost &&
      (entry.externalFileAttributes & dosDirectoryAttribute) !== 0;
    if (
      entry.fileName.endsWith("/") ||
      (attributes & fileTypeMask) === directoryType ||
      isDosDirectory
    ) {
      await fsp.mkdir(destination, { recursive: true });
      continue;
    }

    await fsp.mkdir(parent, { recursive: true });

    if ((attributes & fileTypeMask) === symlinkType) {
      if (entry.uncompressedSize > maxLinkTargetLength) {
        throw new Error(`Zip entry '${entry.fileName}' has a link target that is too long`);
      }
      const target = path.normalize(await text(await zip.openReadStreamPromise(entry)));
      if (path.parse(target).root !== "" || !isInside(root, path.resolve(parent, target))) {
        throw new Error(`Zip entry '${entry.fileName}' links outside the target folder`);
      }
      await fsp.symlink(target, destination);
      continue;
    }

    await pipeline(
      await zip.openReadStreamPromise(entry),
      fs.createWriteStream(destination, { flags: "wx", mode: attributes & 0o777 || 0o644 }),
      { signal },
    );
    await fsp.utimes(destination, new Date(), entry.getLastModDate());
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function assertNoSymlinkOnPath(
  root: string,
  relative: string,
  entryName: string,
): Promise<void> {
  if (relative === "" || relative === ".") {
    return;
  }
  await assertNoSymlinkOnPath(root, path.dirname(relative), entryName);
  const stat = await fsp.lstat(path.join(root, relative)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (stat?.isSymbolicLink()) {
    throw new Error(`Zip entry '${entryName}' goes through a symlink`);
  }
}
