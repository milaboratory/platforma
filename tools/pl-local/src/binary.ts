export type LocalPlBinary = LocalPlBinaryDownload | LocalPlBinaryLocal | LocalPlBinarySource;

export type LocalPlBinaryDownload = {
  type: 'Download';
  dir: string;
  version: string;
}

export type LocalPlBinaryLocal = {
  type: 'Local';
  path: string;
}

export type LocalPlBinarySource = {
  type: 'Source';
  dir: string;
}
