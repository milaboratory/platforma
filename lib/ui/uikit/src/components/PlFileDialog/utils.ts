import { trimChars, trimCharsLeft } from '@milaboratories/helpers';
import type { ImportFileHandle } from '@platforma-sdk/model';

export function normalizeExtensions(extensions: string[] | undefined) {
  return extensions ? extensions.map((it) => '.' + trimCharsLeft(it, ['.'])) : undefined;
}

// NOTE: works only with '/' separator on *nix systems.
export function getFilePathBreadcrumbs(filePath: string) {
  // FIXME: separator probably should be got from ls driver from backend.
  // or else this component won't work with remote storages on Windows.
  const sep = '/';

  // If file path starts with '/',
  // the storage was set up with absolute paths,
  // and we need to add the separator to the results.
  const isAbsolute = filePath.startsWith(sep);
  const chunks = trimChars(filePath, [sep]).split(sep);

  const stack: { index: number; path: string; name: string }[] = [
    {
      index: 0,
      name: 'Root',
      path: '',
    },
  ];

  if (chunks.length === 1 && chunks[0] === '') {
    return stack;
  }

  for (let i = 0; i < chunks.length; i++) {
    const pathPrefix = isAbsolute ? sep : '';
    const p = pathPrefix + chunks.slice(0, i + 1).join(sep);

    stack.push({
      index: i + 1,
      name: chunks[i],
      path: p,
    });
  }

  return stack;
}

export type FileDialogItem = {
  id: number;
  path: string;
  name: string;
  canBeSelected: boolean;
  isDir: boolean;
  selected: boolean;
  handle: ImportFileHandle | undefined;
};
