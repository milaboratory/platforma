/**
 * plblob+folder://signature@sufolder_with_unzipped_blob/
 */
export type FolderURL = `plblob+folder://${string}`;

export type ArchiveFormat = 'zip' | 'tar' | 'tgz';

export interface BlobToURLDriver {
  getPathForCustomProtocol(url: FolderURL): string;
  info(): any;
}
