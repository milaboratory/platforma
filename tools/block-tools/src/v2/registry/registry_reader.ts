import { BlockPackDescriptionManifest } from '@milaboratories/pl-model-middle-layer';
import { FolderReader } from '../../lib/folder_reader';

export class RegistryV2Reader {
  private blockDescriptionCache = new Map<string, BlockPackDescriptionManifest>();
  constructor(private readonly reader: FolderReader) {}

  private 
}
