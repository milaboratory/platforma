import {
  SpawnSyncReturns,
  spawnSync
} from 'child_process';
import { Command } from '@oclif/core';
import { compile, savePacks, createLogger } from '../compiler/main';
import { CtagsFlags, GlobalFlags } from '../shared/basecmd';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as winston from 'winston';

export default class Build extends Command {
  static override description =
    'build tengo sources into single distributable pack file';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...GlobalFlags,
    ...CtagsFlags
  };

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

    await fsp.writeFile('index.d.ts', dts);
    await fsp.writeFile('index.js', js);

    // const compiledDev = compile(logger, 'dev')
    // savePacks(logger, compiledDev, 'dev')
    // logger.info('')

    mergeTagsEnvs(flags)
    if (flags['generate-tags'])
      checkAndGenerateCtags(logger, flags)

    logger.info('Template Pack build done.');
  }
}

function mergeTagsEnvs(flags: {
  'generate-tags': boolean,
  'tags-file': string,
  'tags-additional-args': string[] | string,
}) {
  if (process.env.GENERATE_TAGS != undefined) {
    flags['generate-tags'] = process.env.GENERATE_TAGS == 'true';
  }

  if (process.env.TAGS_FILE != undefined) {
    flags['tags-file'] = process.env.TAGS_FILE;
  }

  if (process.env.TAGS_ADDITIONAL_ARGS != undefined) {
    flags['tags-additional-args'] = process.env.TAGS_ADDITIONAL_ARGS.split(",");
  }
}

function checkAndGenerateCtags(logger: winston.Logger, flags: {
  'tags-file': string,
  'tags-additional-args': string[],
}) {

  const fileName = path.resolve(flags['tags-file']);
  const rootDir = path.dirname(fileName);
  const additionalArgs = flags['tags-additional-args'];

  // all tengo files in dirs and subdirs
  const tengoFiles = getTengoFiles(rootDir)

  logger.info(
    `Generating tags for tengo autocompletion from "${rootDir}" \
in "${fileName}", additional arguments: "${additionalArgs}".
Found ${tengoFiles.length} tengo files...`)

  // see https://docs.ctags.io/en/lates// t/man/ctags-optlib.7.html#perl-pod
  const result = spawnSync(
    'ctags',
    [
      "-f", fileName, ...additionalArgs,
      "--langdef=tengo",
      "--map-tengo=+.tengo",
      "--kinddef-tengo=f,function,function",
      "--regex-tengo=/^\\s*(.*)(:| :=| =) ?func.*/\\1/f/",
      "--kinddef-tengo=c,constant,constant",
      "--regex-tengo=/^\\s*(.*) := (\"|\\{).*/\\1/c/",
      "-R", ...tengoFiles
    ],
    {
      env: process.env,
      stdio: 'inherit',
      cwd: rootDir
    }
  );

  if (result.error?.message.includes('ENOENT')) {
    console.log(`
pl-tengo can create tags for tengo autocompletion,
but the program should be installed
with "brew install universal-ctags" on OSX
or "sudo apt install universal-ctags" on Ubuntu.

For vscode, you should also install ctags extension:
https://marketplace.visualstudio.com/items?itemName=jaydenlin.ctags-support`)

    return
  }

  checkRunError(result, 'failed to generate ctags');

  logger.info('Generation of tags is done.')
}

function getTengoFiles(dir: string): string[] {
  const files = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
  const tengoFiles: string[] = [];

  files.forEach(file => {
    if (!file.isDirectory() && file.name.endsWith('.tengo')) {
      // Note that VS Code extension likes only relatives paths to the root of the opened dir.
      const relativePath = path.join(file.parentPath, file.name).replace(dir, ".")
      tengoFiles.push(relativePath);
    }
  });

  return tengoFiles;
}

function checkRunError(result: SpawnSyncReturns<Buffer>, message?: string) {
  if (result.error) {
    throw result.error;
  }

  const msg = message ?? 'failed to run command';

  if (result.status !== 0) {
    throw new Error(`${msg}, process exited with code '${result.status}'`);
  }
}
