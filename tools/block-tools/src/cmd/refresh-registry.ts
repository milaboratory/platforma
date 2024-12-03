import { Command, Flags } from '@oclif/core';
import { BlockRegistryV2, loadPackDescriptionRaw } from '../v2';
import path from 'path';
import {
  overrideDescriptionVersion,
  overrideManifestVersion,
  StableChannel
} from '@milaboratories/pl-model-middle-layer';
import { storageByUrl } from '../io';
import { OclifLoggerAdapter } from '@milaboratories/ts-helpers-oclif';

export default class RefreshRegistry extends Command {
  static description = 'Refresh overview files based on published but not proecessed artefacts';

  static flags = {
    registry: Flags.string({
      char: 'r',
      summary: 'full address of the registry',
      helpValue: '<address>',
      env: 'PL_REGISTRY',
      required: true
    }),

    mode: Flags.string({
      char: 'm',
      summary: 'refresh mode (allowed valiues: "force", "normal", "dry-run")',
      helpValue: '<mode>',
      options: ['force', 'normal', 'dry-run'],
      env: 'PL_REGISTRY_REFRESH_DRY_RUN',
      default: 'normal'
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(RefreshRegistry);
    const storage = storageByUrl(flags.registry);
    const registry = new BlockRegistryV2(storage, new OclifLoggerAdapter(this));
    await registry.updateIfNeeded(flags.mode as 'force' | 'normal' | 'dry-run');
  }
}
