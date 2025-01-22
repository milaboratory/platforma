import { ArchiveFormat, FolderURL } from '@milaboratories/pl-model-common';
import { Signer } from '@milaboratories/ts-helpers';
import path from 'path';

export function newFolderURL(signer: Signer, saveDir: string, fPath: string): FolderURL {
  const p = path.relative(saveDir, fPath);
  const sign = signer.sign(p);

  return `plblob+folder://${sign}.${p}.blob`;
}

export function isFolderURL(url: string): url is FolderURL {
  const parsed = new URL(url);
  return parsed.protocol == 'plblob+folder:';
}

export function getPathForFolderURL(signer: Signer, url: FolderURL, rootDir: string): string {
  const parsed = new URL(url);
  const [sign, subfolder, _] = parsed.host.split('.');

  signer.verify(subfolder, sign, `signature verification failed for url: ${url}, subfolder: ${subfolder}`);

  let fPath = parseValidPath(path.join(rootDir, `${subfolder}`), parsed.pathname.slice(1));

  if (parsed.pathname == '' || parsed.pathname == '/')
    fPath = path.join(fPath, 'index.html');

  return path.resolve(fPath);
}

/** Checks that the userInputPath is in baseDir and returns an absolute path. */
function parseValidPath(baseDir: string, userInputPath: string): string {
  const absolutePath = path.resolve(baseDir, userInputPath);

  const normalizedBase = path.resolve(baseDir);

  if (!absolutePath.startsWith(normalizedBase)) {
    throw new Error('Path validation failed.');
  }

  return absolutePath;
}
