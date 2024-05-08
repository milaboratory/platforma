import { Args, Command, Flags } from '@oclif/core';
import { getConfig } from '../config';
import { targetFile } from '../flags';
import { CmdLoggerAdapter } from '../lib/cmd';
import { FullBlockPackageName } from '../lib/registry';
import fs from 'node:fs';
import { version } from 'node:os';
import semver from 'semver/preload';

export default class UploadPackage extends Command {
  static description = 'Uploads package and refreshes the registry';

  // static args = {
  //   registry: Args.string({
  //     options: ['registry'],
  //     description: 'Full address of the registry or alias from .pl.registries',
  //     required: true
  //   })
  // };


  static flags = {
    registry: Flags.string({
      char: 'r',
      summary: 'full address of the registry or alias from .pl.reg',
      helpValue: '<address|alias>',
      env: 'PL_REGISTRY',
      default: 'default'
    }),

    organization: Flags.string({
      char: 'o',
      summary: 'target organisation',
      required: true
    }),

    package: Flags.string({
      char: 'p',
      summary: 'target package',
      required: true
    }),

    version: Flags.string({
      char: 'v',
      summary: 'target version',
      required: true
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
      required: true
    }),

    refresh: Flags.boolean({
      summary: 'refresh repository after adding the package',
      default: true,
      allowNo: true
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(UploadPackage);
    const registry = (await getConfig()).createRegistry(flags.registry, new CmdLoggerAdapter(this));
    const name: FullBlockPackageName = {
      organization: flags.organization,
      package: flags.package,
      version: flags.version
    };

    // Validating
    if (!semver.valid(name.version))
      this.error(`Wrong version format, please use valid semver: ${name.version}`, { exit: 1 });

    let meta = {};
    if (flags.meta)
      meta = JSON.parse(await fs.promises.readFile(flags.meta, { encoding: 'utf-8' }));
    const builder = registry.constructNewPackage(name);
    for (const targetFile of flags.file) {
      this.log(`Uploading ${targetFile.src} -> ${targetFile.destName} ...`);
      const content = await fs.promises.readFile(targetFile.src);
      await builder.addFile(targetFile.destName, content);
    }
    this.log(`Uploading meta information...`);
    await builder.writeMeta(meta);
    await builder.finish();

    if (flags.refresh)
      await registry.updateIfNeeded();
  }
}
