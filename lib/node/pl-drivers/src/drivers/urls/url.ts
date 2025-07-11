import type { FolderURL, BlockUIURL } from '@milaboratories/pl-model-common';
import type { Signer } from '@milaboratories/ts-helpers';
import path from 'path';

/** Creates a new plblob+folder URL. */
export function newFolderURL(signer: Signer, saveDir: string, fPath: string): FolderURL {
  const p = path.relative(saveDir, fPath);
  const sign = signer.sign(p);

  return `plblob+folder://${sign}.${p}.blob`;
}

/** Creates a new block-ui URL. */
export function newBlockUIURL(signer: Signer, saveDir: string, fPath: string): BlockUIURL {
  const p = path.relative(saveDir, fPath);
  const sign = signer.sign(p);

  return `block-ui://${sign}.${p}.blob`;
}

/** Checks the signature and path injections.
 * @returns the path to the file inside the root directory. */
export function getPathForFolderURL(signer: Signer, url: FolderURL, rootDir: string): string {
  return getPath(signer, url, rootDir);
}

/** Checks the signature and path injections.
 * @returns the path to the file inside the root directory. */
export function getPathForBlockUIURL(signer: Signer, url: BlockUIURL, rootDir: string): string {
  return getPath(signer, url, rootDir);
}

/** Parses URL,
 * checks the signature,
 * gets the absolute path by the given root directory.
 * If the path is empty, it returns the index.html file.
 * @returns an absolute path for the user. */
function getPath(signer: Signer, url: string, rootDir: string): string {
  const parsed = new URL(url);
  const [sign, subfolder, _] = parsed.host.split('.');

  signer.verify(subfolder, sign, `signature verification failed for url: ${url}, subfolder: ${subfolder}`);

  let fPath = parseNestedPathNoEscape(path.join(rootDir, `${subfolder}`), parsed.pathname.slice(1));

  if (parsed.pathname == '' || parsed.pathname == '/') {
    fPath = path.join(fPath, 'index.html');
  }

  return path.resolve(fPath);
}

/** Checks that the userInputPath is in baseDir.
 * @returns an absolute path for the user. */
function parseNestedPathNoEscape(baseDir: string, userInputPath: string): string {
  const absolutePath = path.resolve(baseDir, userInputPath);

  const normalizedBase = path.resolve(baseDir);

  if (!absolutePath.startsWith(normalizedBase)) {
    throw new Error('Path validation failed.');
  }

  return absolutePath;
}
