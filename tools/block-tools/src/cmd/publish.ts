import { Command, Flags } from '@oclif/core';
import fs from 'node:fs';
import { OclifLoggerAdapter } from '@milaboratories/ts-helpers-oclif';
import { ManifestFileName } from '../v2/registry/schema_public';
import { BlockPackManifest } from '@milaboratories/pl-model-middle-layer';
import { storageByUrl } from '../lib/storage';
import { BlockRegistryV2 } from '../v2/registry/registry';
import path from 'node:path';

export default class Publish extends Command {
  static description =
    'Publishes the block package and refreshes the registry (for v2 block-pack schema)';

  static flags = {
    registry: Flags.string({
      char: 'r',
      summary: 'full address of the registry',
      helpValue: '<address>',
      env: 'PL_REGISTRY',
      required: true
    }),

    manifest: Flags.file({
      char: 'm',
      summary: 'manifest file path',
      exists: true,
      default: `./block-pack/${ManifestFileName}`
    }),

    refresh: Flags.boolean({
      summary: 'refresh repository after adding the package',
      default: true,
      allowNo: true,
      env: 'PL_REGISTRY_REFRESH'
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Publish);

    // if (flags.meta) {
    //   if (flags.meta.endsWith('.json'))
    //     configFromFlags.meta = JSON.parse(
    //       await fs.promises.readFile(flags.meta, { encoding: 'utf-8' })
    //     );
    //   else if (flags.meta.endsWith('.yaml'))
    //     configFromFlags.meta = YAML.parse(
    //       await fs.promises.readFile(flags.meta, { encoding: 'utf-8' })
    //     );
    // }

    const manifestPath = path.resolve(flags.manifest);
    const manifest = BlockPackManifest.parse(
      JSON.parse(await fs.promises.readFile(manifestPath, { encoding: 'utf-8' }))
    );
    const manifestRoot = path.dirname(manifestPath);

    this.log(`Manifest root = ${manifestRoot}`);

    const storage = storageByUrl(flags.registry);
    const registry = new BlockRegistryV2(storage, new OclifLoggerAdapter(this));

    await registry.publishPackage(manifest, async (file) =>
      Buffer.from(await fs.promises.readFile(path.resolve(manifestRoot, file)))
    );

    if (flags.refresh) await registry.updateIfNeeded();
  }
}
