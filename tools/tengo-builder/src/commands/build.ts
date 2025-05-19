import type { SpawnSyncReturns } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { Command } from '@oclif/core';
import { compile, savePacks, getPackageInfo } from '../compiler/main';
import { createLogger } from '../compiler/util';
import { CtagsFlags, GlobalFlags } from '../shared/basecmd';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type * as winston from 'winston';
import type { TemplatesAndLibs } from '../compiler/compiler';

export default class Build extends Command {
  static override description = 'build tengo sources into single distributable pack file';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...GlobalFlags,
    ...CtagsFlags,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Build);
    const logger = createLogger(flags['log-level']);

    const packageInfo = getPackageInfo(process.cwd(), logger);
    const compiledDist = compile(logger, packageInfo, 'dist');
    savePacks(logger, compiledDist, 'dist');
    logger.info('Template Pack build done.');

    // Building TS bindings for templates
    const { dts, cjs, mjs } = generateTsBinding(compiledDist);
    await fsp.writeFile('dist/index.d.ts', dts);
    if (packageInfo.type === 'module') {
      await fsp.writeFile('dist/index.cjs', cjs);
      await fsp.writeFile('dist/index.js', mjs);
    } else {
      await fsp.writeFile('dist/index.js', cjs);
      await fsp.writeFile('dist/index.mjs', mjs);
    }

    mergeTagsEnvs(flags);
    if (flags['generate-tags']) checkAndGenerateCtags(logger, flags);

    logger.info('Template Pack build done.');
  }
}

function generateTsBinding(compiledDist: TemplatesAndLibs) {
  let dts = `declare type TemplateFromFile = { readonly type: "from-file"; readonly path: string; };\n`;
  dts += `declare type TplName = ${compiledDist.templates
    .map((tpl) => '"' + tpl.fullName.id + '"')
    .join(' | ')};\n`;
  dts += `declare const Templates: Record<TplName, TemplateFromFile>;\n`;
  dts += `export { Templates };\n`;
  let cjs = `module.exports = { Templates: {\n`;
  let mjs = `import { resolve } from 'node:path';\nexport const Templates = {\n`;
  const recordsCjs = compiledDist.templates
    .map(
      (tpl) => `  '${tpl.fullName.id}': { type: 'from-file', path: require.resolve('./tengo/tpl/${tpl.fullName.id}.plj.gz') }`,
    )
    .join(',\n');
  const recordsMjs = compiledDist.templates
    .map(
      (tpl) => `  '${tpl.fullName.id}': { type: 'from-file', path: resolve(import.meta.dirname, './tengo/tpl/${tpl.fullName.id}.plj.gz') }`,
    )
    .join(',\n');
  cjs += recordsCjs;
  mjs += recordsMjs;
  cjs += `\n}};\n`;
  mjs += `\n};\n`;

  return { dts, cjs, mjs };
}

function mergeTagsEnvs(flags: {
  'generate-tags': boolean;
  'tags-file': string;
  'tags-additional-args': string[] | string;
}) {
  if (process.env.GENERATE_TAGS != undefined) {
    flags['generate-tags'] = process.env.GENERATE_TAGS == 'true';
  }

  if (process.env.TAGS_FILE != undefined) {
    flags['tags-file'] = process.env.TAGS_FILE;
  }

  if (process.env.TAGS_ADDITIONAL_ARGS != undefined) {
    flags['tags-additional-args'] = process.env.TAGS_ADDITIONAL_ARGS.split(',');
  }
}

function checkAndGenerateCtags(
  logger: winston.Logger,
  flags: {
    'tags-file': string;
    'tags-additional-args': string[];
  },
) {
  const fileName = path.resolve(flags['tags-file']);
  const rootDir = path.dirname(fileName);
  const additionalArgs = flags['tags-additional-args'];

  // all tengo files in dirs and subdirs
  // If we don't limit the depth, it could become unbearably slow
  // and even OOM killed node js.
  // Increase the depth if you need to.
  const tengoFiles = toRelativePath(rootDir, getTengoFiles(rootDir, 9));

  logger.info(
    `Generating tags for tengo autocompletion from "${rootDir}" \
in "${fileName}", additional arguments: "${additionalArgs.join('" "')}".
Found ${tengoFiles.length} tengo files...`,
  );

  // see https://docs.ctags.io/en/latest/man/ctags-optlib.7.html#perl-pod
  const result = spawnSync(
    'ctags',
    [
      '-f',
      fileName,
      ...additionalArgs,
      '--langdef=tengo',
      '--map-tengo=+.tengo',
      '--kinddef-tengo=f,function,function',
      '--regex-tengo=/^\\s*(.*)(:| :=| =) ?func.*/\\1/f/',
      '--kinddef-tengo=c,constant,constant',
      '--regex-tengo=/^\\s*(.*) := ("|\\{).*/\\1/c/',
      '-R',
      ...tengoFiles,
    ],
    {
      env: process.env,
      stdio: 'inherit',
      cwd: rootDir,
    },
  );

  if (result.error?.message.includes('ENOENT')) {
    console.log(`
pl-tengo can create tags for tengo autocompletion,
but the program should be installed
with "brew install universal-ctags" on OSX
or "sudo apt install universal-ctags" on Ubuntu.

For vscode, you should also install ctags extension:
https://marketplace.visualstudio.com/items?itemName=jaydenlin.ctags-support`);

    return;
  }

  checkRunError(result, 'failed to generate ctags');

  logger.info('Generation of tags is done.');
}

function getTengoFiles(dir: string, depth: number): string[] {
  if (depth === 0) {
    return [];
  }

  const files = fs.readdirSync(dir, { withFileTypes: true });

  let tengoFiles: string[] = [];
  files.forEach((file) => {
    const absPath = path.join(dir, file.name);

    if (file.isDirectory()) {
      tengoFiles = tengoFiles.concat(getTengoFiles(absPath, depth - 1));
    }

    if (!file.isDirectory() && file.name.endsWith('.tengo')) {
      tengoFiles.push(absPath);
    }
  });

  return tengoFiles;
}

function toRelativePath(dir: string, files: string[]): string[] {
  // Note that VS Code extension likes only relatives paths to the root of the opened dir.
  return files.map((file) => file.replace(dir, '.'));
}

function checkRunError(result: SpawnSyncReturns<Buffer>, message?: string) {
  if (result.error) {
    console.log(result.error);
  }

  const msg = message ?? 'failed to run command';

  if (result.status !== 0) {
    console.log(`WARN: ${msg} the build will continue as-is`);
  }
}
