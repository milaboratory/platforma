import { Command } from '@oclif/core';
import { compile, savePacks, createLogger } from '../compiler/main';
import { GlobalFlags } from '../shared/basecmd';
import * as fs from 'node:fs/promises';

export default class Build extends Command {
  static override description =
    'build tengo sources into single distributable pack file';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = { ...GlobalFlags };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Build);
    const logger = createLogger(flags['log-level']);

    const compiledDist = compile(logger, 'dist');
    savePacks(logger, compiledDist, 'dist');
    logger.info('');

    // Building TS bindings for templates
    let dts = `declare type TemplateFromFile = { readonly type: "from-file"; readonly path: string; };\n`;
    dts += `declare type TplName = ${compiledDist.templates
      .map((tpl) => '"' + tpl.fullName.id + '"')
      .join(' | ')};\n`;
    dts += `declare const Templates: Record<TplName, TemplateFromFile>;\n`;
    dts += `export { Templates };\n`;
    let js = `module.exports = { Templates: {\n`;
    js += compiledDist.templates
      .map(
        (tpl) =>
          `  '${tpl.fullName.id}': { type: 'from-file', path: require.resolve('./dist/tengo/tpl/${tpl.fullName.id}.plj.gz') }`
      )
      .join(',\n');
    js += `\n}}\n`;

    fs.writeFile('index.d.ts', dts);
    fs.writeFile('index.js', js);

    // const compiledDev = compile(logger, 'dev')
    // savePacks(logger, compiledDev, 'dev')
    // logger.info('')

    logger.info('Template Pack build done.');
  }
}
