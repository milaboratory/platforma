import fs, { createWriteStream } from 'fs';
import path from 'path';
import winston from 'winston';
import { Writable, Transform } from 'node:stream';
import os from 'os';
import readlineSync from 'readline-sync';
import { z } from 'zod';
import decompress from 'decompress';

const CreateBlockOptions = z.object({
  npmOrgName: z.string().min(1),
  orgName: z.string().min(1),
  blockName: z.string().min(1)
});
export type CreateBlockOptions = z.infer<typeof CreateBlockOptions>;

/** Creates a block by cloning block-boilerplate repository. */
export async function createBlock(logger: winston.Logger) {
  const options = askForOptions();
  const targetPath = path.join(process.cwd(), options.blockName);

  logger.info(`Downloading boilerplate code...`);
  await downloadAndUnzip(
    'https://github.com/milaboratory/platforma-block-boilerplate/archive/refs/heads/main.zip',
    "platforma-block-boilerplate-main",
    targetPath,
  )

  logger.info(`Replace everything in the template with provided options...`);
  replaceInAllFiles(
    targetPath,
    /pl-open\/my-org.block-boilerplate/g,
    `${options.npmOrgName}/${options.orgName}.${options.blockName}`
  );
}

function askForOptions(): CreateBlockOptions {
  let npmOrgName = readlineSync.question(
    "Write an organization name for npm. Default is \"pl-open\": ",
  );
  if (npmOrgName === "") {
    npmOrgName = "pl-open";
  }
  const orgName = readlineSync.question("Write an organization name, e.g. \"my-org\": ");
  const blockName = readlineSync.question("Write a name of the block, e.g. \"hello-world\": ");

  return CreateBlockOptions.parse({ npmOrgName, orgName, blockName });
}

async function downloadAndUnzip(url: string, pathInArchive: string, outputPath: string) {
  const response = await fetch(url);
  const content = await response.blob();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-repo'));

  const tmpFile = path.join(tmpDir, "packed-repo.zip");
  const f = Writable.toWeb(createWriteStream(tmpFile));
  await content.stream().pipeTo(f);

  const tmpRepo = path.join(tmpDir, "unpacked-repo");
  fs.mkdirSync(tmpRepo);
  await decompress(tmpFile, tmpRepo);

  fs.cpSync(path.join(tmpRepo, pathInArchive), outputPath, { recursive: true });
}

function replaceInAllFiles(
  dir: string,
  from: RegExp,
  to: string,
) {
  getAllFiles(dir).forEach((fPath) => replaceInFile(fPath, from, to));
}

function getAllFiles(dir: string): string[] {
  const allDirents = fs.readdirSync(dir, {
    withFileTypes: true,
    recursive: true
  });

  return allDirents
    .filter((f) => f.isFile())
    .map((f) => path.join(f.parentPath, f.name));
}

function replaceInFile(fPath: string, from: RegExp, to: string) {
  const content = fs.readFileSync(fPath);
  const newContent = content.toString().replaceAll(from, to);
  fs.writeFileSync(fPath, newContent);
}

