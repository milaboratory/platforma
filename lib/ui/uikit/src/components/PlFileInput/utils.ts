export function extractFileName(filePath: string) {
  return filePath.replace(/^.*[\\/]/, '');
}

export function extractExtension(filePath: string) {
  const parts = extractFileName(filePath).split('.');

  if (parts.length > 2) {
    return parts.slice(-2).join('.');
  } else if (parts.length === 2) {
    return parts.slice(-1).join('.');
  }

  return '';
}

export function extractPaths(e: DragEvent, extensions?: string[]) {
  const paths: string[] = [];

  if (e.dataTransfer) {
    for (let i = 0; i < e.dataTransfer.items.length; i++) {
      if (e.dataTransfer.items[i].kind !== 'file') {
        continue;
      }
      const file = e.dataTransfer.items[i].getAsFile() as (File & { path: string }) | null; // @TODO check
      if (file && file.path) {
        paths.push(file.path);
      }
    }
  }

  if (extensions) {
    return paths.filter((p) => extensions.includes(extractExtension(extractFileName(p))));
  }

  return paths;
}
