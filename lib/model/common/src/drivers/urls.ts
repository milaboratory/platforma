/**
 * plblob+folder://signature@sufolder_with_unzipped_blob/
 */
export type FolderURL = `plblob+folder://${string}`;

export type ArchiveFormat = "zip" | "tar" | "tgz";

export interface BlobToURLDriver {
  getPathForCustomProtocol(url: FolderURL): string;
}

export function isFolderURL(url: string): url is FolderURL {
  const parsed = new URL(url);
  return parsed.protocol == "plblob+folder:";
}

/**
 * URLs and a custom protocol for the block UI.
 * block-ui://signature@folder_with_ui/
 */
export type BlockUIURL = `block-ui://${string}`;

export interface FrontendDriver {
  getPathForBlockUI(url: BlockUIURL): string;
}

export function isBlockUIURL(url: string): url is BlockUIURL {
  const parsed = new URL(url);
  return parsed.protocol == "block-ui:";
}
