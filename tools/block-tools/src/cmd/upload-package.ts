import { Command, Flags } from '@oclif/core';
import { getConfig } from '../config';
import { targetFile } from '../flags';
import fs from 'node:fs';
import YAML from 'yaml';
import { PlRegPackageConfigDataShard } from '../config_schema';
import { OclifLoggerAdapter } from '@milaboratory/ts-helpers-oclif';

type BasicConfigField = keyof PlRegPackageConfigDataShard &
  ('registry' | 'organization' | 'package' | 'version');
const BasicConfigFields: BasicConfigField[] = ['registry', 'organization', 'package', 'version'];

export default class UploadPackage extends Command {
  static description = 'Uploads package and refreshes the registry';

  static flags = {
    registry: Flags.string({
      char: 'r',
      summary: 'full address of the registry or alias from .pl.reg',
      helpValue: '<address|alias>',
      env: 'PL_REGISTRY'
    }),

    organization: Flags.string({
      char: 'o',
      summary: 'target organisation',
      env: 'PL_PACKAGE_ORGANIZATION'
    }),

    package: Flags.string({
      char: 'p',
      summary: 'target package',
      env: 'PL_PACKAGE_NAME'
    }),

    version: Flags.string({
      char: 'v',
      summary: 'target version',
      env: 'PL_PACKAGE_VERSION'
    }),

    meta: Flags.file({
      char: 'm',
      summary: 'json file containing meta information to associate with tha package',
      exists: true
    }),

    file: targetFile({
      char: 'f',
      summary: 'package files',
      multiple: true,
      default: []
    }),

    refresh: Flags.boolean({
      summary: 'refresh repository after adding the package',
      default: true,
      allowNo: true,
      env: 'PL_REGISTRY_REFRESH'
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(UploadPackage);
    const configFromFlags: PlRegPackageConfigDataShard = PlRegPackageConfigDataShard.parse({});

    for (const field of BasicConfigFields) if (flags[field]) configFromFlags[field] = flags[field];

    if (flags.meta) {
      if (flags.meta.endsWith('.json'))
        configFromFlags.meta = JSON.parse(
          await fs.promises.readFile(flags.meta, { encoding: 'utf-8' })
        );
      else if (flags.meta.endsWith('.yaml'))
        configFromFlags.meta = YAML.parse(
          await fs.promises.readFile(flags.meta, { encoding: 'utf-8' })
        );
    }

    for (const targetFile of flags.file) {
      configFromFlags.files[targetFile.destName] = targetFile.src;
    }

    const conf = await getConfig(configFromFlags);

    this.log(YAML.stringify(conf.conf));

    const registry = conf.createRegistry(new OclifLoggerAdapter(this));
    const name = conf.fullPackageName;

    const builder = registry.constructNewPackage(name);

    for (const [dst, src] of Object.entries(conf.conf.files)) {
      this.log(`Uploading ${src} -> ${dst} ...`);
      const content = await fs.promises.readFile(src);
      await builder.addFile(dst, content);
    }

    this.log(`Uploading meta information...`);
    await builder.writeMeta(conf.conf.meta);
    await builder.finish();

    if (flags.refresh) await registry.updateIfNeeded();
  }
}
