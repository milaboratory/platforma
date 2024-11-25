/** Handle of locally downloaded blob. This handle is issued only after the
 * blob's content is downloaded locally, and ready for quick access. */

import { LocalBlobHandle } from '@milaboratories/pl-model-common';
import { Signer } from '@milaboratories/ts-helpers';

// https://regex101.com/r/kfnBVX/1
const localHandleRegex = /^blob\+local:\/\/download\/(?<path>.*)#(?<signature>.*)$/;

export function newLocalHandle(path: string, signer: Signer): LocalBlobHandle {
  return `blob+local://download/${path}#${signer.sign(path)}` as LocalBlobHandle;
}

export function isLocalBlobHandle(handle: string): handle is LocalBlobHandle {
  return Boolean(handle.match(localHandleRegex));
}

export function parseLocalHandle(handle: LocalBlobHandle, signer: Signer) {
  const parsed = handle.match(localHandleRegex);

  if (parsed === null) {
    throw new Error(`Local handle is malformed: ${handle}, matches: ${parsed}`);
  }

  const { path, signature } = parsed.groups!;
  signer.verify(path, signature, `Signature verification failed for: ${handle}`);

  return { path, signature };
}
