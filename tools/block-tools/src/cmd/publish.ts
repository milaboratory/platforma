import { Command, Flags } from '@oclif/core';
import fs from 'node:fs';
import { OclifLoggerAdapter } from '@milaboratories/ts-helpers-oclif';
import { ManifestFileName } from '../v2/registry/schema_public';
import { BlockPackManifest, overrideManifestVersion, StableChannel } from '@milaboratories/pl-model-middle-layer';
import { storageByUrl } from '../io/storage';
import { BlockRegistryV2 } from '../v2/registry/registry';
import path from 'node:path';

function simpleDeepMerge<T extends Record<string, unknown>>(
  target: Record<string, unknown>,
  source: T,
): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
        result[key] = simpleDeepMerge(result[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
      } else {
        result[key] = source[key];
      }
    } else {
      result[key] = source[key];
    }
  }

  return result as T;
}

export default class Publish extends Command {
  static description
    = 'Publishes the block package and refreshes the registry (for v2 block-pack schema)';

  static flags = {
    'registry': Flags.string({
      char: 'r',
      summary: 'full address of the registry',
      helpValue: '<address>',
      env: 'PL_REGISTRY',
      required: true,
    }),

    'manifest': Flags.file({
      char: 'm',
      summary: 'manifest file path',
      exists: true,
      default: `./block-pack/${ManifestFileName}`,
    }),

    'version-override': Flags.file({
      char: 'v',
      summary: 'override package version',
    }),

    'refresh': Flags.boolean({
      summary: 'refresh repository after adding the package',
      default: true,
      allowNo: true,
      env: 'PL_REGISTRY_REFRESH',
    }),

    'unstable': Flags.boolean({
      summary: 'do not add the published package to stable channel',
      default: false,
      env: 'PL_PUBLISH_UNSTABLE',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Publish);

    const manifestPath = path.resolve(flags.manifest);
    const rawManifest = JSON.parse(await fs.promises.readFile(manifestPath, { encoding: 'utf-8' }));
    let manifest = BlockPackManifest.parse(rawManifest);
    // To keep extra fields from the manifest and keep coerced fields
    manifest = simpleDeepMerge(rawManifest, manifest);
    const manifestRoot = path.dirname(manifestPath);

    this.log(`Manifest root = ${manifestRoot}`);

    if (flags['version-override'])
      manifest = overrideManifestVersion(manifest, flags['version-override']);

    const storage = storageByUrl(flags.registry);
    const registry = new BlockRegistryV2(storage, new OclifLoggerAdapter(this));

    await registry.publishPackage(manifest, async (file) =>
      Buffer.from(await fs.promises.readFile(path.resolve(manifestRoot, file))),
    );

    if (!flags.unstable) {
      this.log(`Adding package to ${StableChannel} channel...`);
      await registry.addPackageToChannel(manifest.description.id, StableChannel);
    }

    if (flags.refresh) await registry.updateIfNeeded();
  }
}
