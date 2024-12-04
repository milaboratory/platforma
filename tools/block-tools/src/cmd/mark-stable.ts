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

export default class MarkStable extends Command {
  static description = 'Mark target block stable';

  static flags = {
    modulePath: Flags.string({
      char: 'i',
      summary: 'input module path',
      helpValue: '<path>',
      default: '.'
    }),

    channel: Flags.string({
      char: 'c',
      hidden: true,
      summary: 'custom channel',
      helpValue: '<channel name>',
      default: StableChannel
    }),

    'version-override': Flags.file({
      char: 'v',
      summary: 'override package version'
    }),

    registry: Flags.string({
      char: 'r',
      summary: 'full address of the registry',
      helpValue: '<address>',
      env: 'PL_REGISTRY',
      required: true
    }),

    refresh: Flags.boolean({
      summary: 'refresh repository after adding the package',
      default: true,
      allowNo: true,
      env: 'PL_REGISTRY_REFRESH'
    }),

    unmark: Flags.boolean({
      summary:
        'reverses meaning of this command, flag can be used to remove "stable" flag from the package',
      default: false
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(MarkStable);
    let description = await loadPackDescriptionRaw(path.resolve(flags.modulePath));
    if (flags['version-override'])
      description = overrideDescriptionVersion(description, flags['version-override']);
    const storage = storageByUrl(flags.registry);
    const registry = new BlockRegistryV2(storage, new OclifLoggerAdapter(this));

    if (flags.unmark) await registry.removePackageFromChannel(description.id, flags.channel);
    else await registry.addPackageToChannel(description.id, flags.channel);

    if (flags.refresh) await registry.updateIfNeeded();
  }
}
