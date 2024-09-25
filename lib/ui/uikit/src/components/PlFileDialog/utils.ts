import type { ImportFileHandle } from '@platforma-sdk/model';

export function getFilePathBreadcrumbs(filePath: string) {
  const chunks = filePath.split('/');

  const stack: { index: number; path: string; name: string }[] = [];

  for (let i = 0; i < chunks.length; i++) {
    stack.push({
      index: i,
      name: i === 0 ? 'Root' : chunks[i],
      path: chunks.slice(0, i + 1).join('/'),
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
