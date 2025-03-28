import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import type winston from 'winston';
import { Writable, Transform } from 'node:stream';
import os from 'node:os';
import readlineSync from 'readline-sync';
import { z } from 'zod';
import decompress from 'decompress';
import yaml from 'yaml';

const blockPlatformsToChoose = ['Python'];
const allPlatforms = ['Tengo', 'Python'] as const;
const CreateBlockPlatforms = z.union([z.literal('Tengo'), z.literal('Python')]);
export type CreateBlockPlatform = z.infer<typeof CreateBlockPlatforms>;

const CreateBlockOptions = z.object({
  npmOrgName: z.string().min(1),
  orgName: z.string().min(1, { message: `Organization name must be provided` }),
  blockName: z.string().min(1, { message: `Block name must be provided` }),
  softwarePlatforms: z.array(CreateBlockPlatforms).refine((p) => new Set(p).size === p.length, {
    message: 'Must be an array of unique software platforms',
  }),
});
export type CreateBlockOptions = z.infer<typeof CreateBlockOptions>;

/** Creates a block by cloning block-boilerplate repository. */
export async function createBlock(logger: winston.Logger) {
  const { npmOrgName, orgName, blockName, softwarePlatforms } = askForOptions();
  const targetPath = path.join(process.cwd(), blockName);

  logger.info(`Downloading boilerplate code...`);
  await downloadAndUnzip(
    // 'https://github.com/milaboratory/platforma-block-boilerplate/archive/refs/heads/software_platforms.zip',
    // 'platforma-block-boilerplate-software_platforms',
    'https://github.com/milaboratory/platforma-block-boilerplate/archive/refs/heads/main.zip',
    'platforma-block-boilerplate-main',
    targetPath,
  );

  const platformsToRemove = allPlatforms.filter((p) => softwarePlatforms.indexOf(p) < 0);
  const noPlatforms = blockPlatformsToChoose.length == platformsToRemove.length;
  logger.info(`Keep platforms '${softwarePlatforms}', remove: '${platformsToRemove}'. Will remove all platforms? ${noPlatforms}`);
  for (const p of platformsToRemove) {
    await removePlatform(targetPath, p);
  }
  if (noPlatforms) {
    await removePlatformsCompletely(targetPath);
  }

  logger.info(`Replace everything in the template with provided options...`);
  replaceRegexInAllFiles(targetPath, [
    // '@' literal ensures only npm org name will be renamed,
    // as public registry for software also is called platforma-open, but without '@'.
    // Also, don't rename an organization for runenv-python-3 package.
    { from: /@platforma-open(?!.*runenv-python-3)/g, to: `@${npmOrgName}` },

    { from: /my-org/g, to: orgName },

    { from: /block-boilerplate/g, to: blockName },
  ]);
}

function askForOptions(): CreateBlockOptions {
  let npmOrgName = readlineSync.question(
    'Write an organization name for npm. Default is "platforma-open": ',
  );
  if (npmOrgName === '') {
    npmOrgName = 'platforma-open';
  }

  let orgName = '';
  while (orgName.length < 1)
    orgName = readlineSync.question('Write an organization name, e.g. "my-org": ');

  let blockName = '';
  while (blockName.length < 1)
    blockName = readlineSync.question('Write a name of the block, e.g. "hello-world": ');

  const needSoftware = readlineSync.keyInYN('Create package for block\'s software?');
  let softwarePlatforms = ['Tengo'];
  if (needSoftware) {
    while (softwarePlatforms.length < allPlatforms.length) {
      const index = readlineSync.keyInSelect(blockPlatformsToChoose, 'Choose software platform:');
      if (index < 0) break;
      softwarePlatforms.push(blockPlatformsToChoose[index]);
    }
  }
  softwarePlatforms = Array.from(new Set(softwarePlatforms)).sort();

  const result = CreateBlockOptions.safeParse({ npmOrgName, orgName, blockName, softwarePlatforms });
  if (!result.success && result.error.issues.length) {
    throw new Error(result.error.issues.map(i => i.message).join('; '));
  }

  return result.data!;
}

async function downloadAndUnzip(url: string, pathInArchive: string, outputPath: string) {
  const response = await fetch(url);
  const content = await response.blob();

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-repo'));

  const tmpFile = path.join(tmpDir, 'packed-repo.zip');
  const f = Writable.toWeb(createWriteStream(tmpFile));
  await content.stream().pipeTo(f);

  const tmpRepo = path.join(tmpDir, 'unpacked-repo');
  await fs.mkdir(tmpRepo);
  await decompress(tmpFile, tmpRepo);

  await fs.cp(path.join(tmpRepo, pathInArchive), outputPath, { recursive: true });
}

/** Removes a bunch of dependencies to the platform. */
async function removePlatform(dir: string, platform: CreateBlockPlatform) {
  const p = platform.toLowerCase();

  // Remove <PlAlert> line from MainPage.vue
  // https://regex101.com/r/oCTyHk/1
  await deleteRegexInFile(
    path.join(dir, 'ui', 'src', 'pages', 'MainPage.vue'),
    new RegExp(`.*${p}Message.*\\n`, 'g'),
  );

  // Remove an output from the model.
  await deleteRegexInFile(
    path.join(dir, 'model', 'src', 'index.ts'),
    new RegExp(`.*${p}Message.*\\n\\n`, 'g'),
  );

  // This regexp represents a block of code until the empty line.
  // https://regex101.com/r/Os8kX1/1
  await deleteRegexInFile(
    path.join(dir, 'workflow', 'src', 'main.tpl.tengo'),
    new RegExp(`.*${p}.*exec.builder.*[\\s\\S]*?\\n\\n`, 'g'),
  );

  // Remove a line from the workflow output.
  // https://regex101.com/r/PkHwQ8/1
  await deleteRegexInFile(
    path.join(dir, 'workflow', 'src', 'main.tpl.tengo'),
    new RegExp(`.*${p}Message.*\\n`, 'g'),
  );

  // Remove 2 lines: the one with the language message and the one with expect
  await deleteRegexInFile(
    path.join(dir, 'workflow', 'src', 'wf.test.ts'),
    new RegExp(`.*${p}Message.*\\n.*expect.*\\n\\n`, 'g'),
  );

  await fs.rm(path.join(dir, 'software', `src_${p}`), { recursive: true });

  await replaceInFile(
    path.join(dir, 'software', 'package.json'),
    (content) => {
      const json = JSON.parse(content);
      delete json['block-software']['artifacts'][`hello-${p}-artifact`];
      delete json['block-software']['entrypoints'][`hello-world-${p}`];
      return JSON.stringify(json, null, 2);
    },
  );
}

/** Removes software directory completely and all references to it from the workspace. */
async function removePlatformsCompletely(dir: string) {
  await fs.rm(path.join(dir, 'software'), { recursive: true });

  await replaceInFile(
    path.join(dir, 'workflow', 'package.json'),
    (content) => {
      const json = JSON.parse(content);
      delete json['dependencies']['@platforma-open/my-org.block-boilerplate.software'];
      return JSON.stringify(json, null, 2);
    },
  );

  await deleteRegexInFile(
    path.join(dir, 'pnpm-workspace.yaml'),
    /.*- software$\n/gm,
  );
}

async function replaceRegexInAllFiles(
  dir: string,
  patterns: { from: RegExp; to: string }[],
) {
  const files = await getAllFiles(dir);
  for (const { from, to } of patterns) {
    for (const fPath of files) {
      await replaceRegexInFile(fPath, from, to);
    }
  }
}

async function getAllFiles(dir: string): Promise<string[]> {
  const allDirents = await fs.readdir(dir, {
    withFileTypes: true,
    recursive: true,
  });

  return allDirents.filter((f: any) => f.isFile()).map((f: any) => path.join(f.parentPath, f.name));
}

async function replaceInFile(fPath: string, replacer: (content: string) => any) {
  const content = await fs.readFile(fPath);
  const newContent = replacer(content.toString());
  await fs.writeFile(fPath, newContent);
}

async function replaceRegexInFile(fPath: string, from: RegExp, to: string) {
  return await replaceInFile(fPath, (content) => content.replaceAll(from, to));
}

async function deleteRegexInFile(fPath: string, what: RegExp) {
  return await replaceRegexInFile(fPath, what, '');
}
