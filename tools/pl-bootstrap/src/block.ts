import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import type winston from "winston";
import { Writable } from "node:stream";
import os from "node:os";
import readlineSync from "readline-sync";
import * as tar from "tar";
import { z } from "zod";

const blockPlatformsToChoose = ["Python"];
const allPlatforms = ["Tengo", "Python"] as const;
const CreateBlockPlatforms = z.union([z.literal("Tengo"), z.literal("Python")]);
export type CreateBlockPlatform = z.infer<typeof CreateBlockPlatforms>;

const CreateBlockOptions = z.object({
  npmOrgName: z.string().min(1),
  orgName: z.string().min(1, { message: `Organization name must be provided` }),
  blockName: z.string().min(1, { message: `Block name must be provided` }),
  softwarePlatforms: z.array(CreateBlockPlatforms).refine((p) => new Set(p).size === p.length, {
    message: "Must be an array of unique software platforms",
  }),
});
export type CreateBlockOptions = z.infer<typeof CreateBlockOptions>;

/** Anything with `info`, so callers outside the CLI do not need winston. */
export type CreateBlockLogger = Pick<winston.Logger, "info">;

/** Options the CLI may receive as flags; any one that is missing is asked for. */
export type CreateBlockPartialOptions = Partial<CreateBlockOptions>;

/**
 * Creates a block by cloning block-boilerplate repository into `<cwd>/<blockName>`.
 * Asks for every option not given in `given`; with all of them given it never prompts.
 */
export async function createBlock(
  logger: CreateBlockLogger,
  given: CreateBlockPartialOptions = {},
) {
  const options = askForOptions(given);
  await createBlockFromOptions(options, path.join(process.cwd(), options.blockName), logger);
}

/**
 * Non-interactive core of `create-block`: downloads the boilerplate into `targetPath`
 * (which must not exist yet) and renames it for the given npm org, org and block.
 * Safe to call from a server or a function: no prompts, no use of `process.cwd()`.
 */
export async function createBlockFromOptions(
  given: CreateBlockOptions,
  targetPath: string,
  logger: CreateBlockLogger,
) {
  const { npmOrgName, orgName, blockName, softwarePlatforms } = parseOptions(given);

  logger.info(`Downloading boilerplate code...`);
  await downloadAndUnpack(
    // 'https://github.com/milaboratory/platforma-block-boilerplate/archive/refs/heads/software_platforms.tar.gz',
    // 'platforma-block-boilerplate-software_platforms',
    "https://github.com/milaboratory/platforma-block-boilerplate/archive/refs/heads/main.tar.gz",
    "platforma-block-boilerplate-main",
    targetPath,
  );

  const platformsToRemove = allPlatforms.filter((p) => softwarePlatforms.indexOf(p) < 0);
  const noPlatforms = blockPlatformsToChoose.length == platformsToRemove.length;
  logger.info(
    `Keep platforms '${softwarePlatforms}', remove: '${platformsToRemove}'. Will remove all platforms? ${noPlatforms}`,
  );
  for (const p of platformsToRemove) {
    await removePlatform(targetPath, p);
  }
  if (noPlatforms) {
    await removePlatformsCompletely(targetPath);
  }

  logger.info(`Replace everything in the template with provided options...`);
  await replaceRegexInAllFiles(targetPath, [
    // '@' literal ensures only npm org name will be renamed,
    // as public registry for software also is called platforma-open, but without '@'.
    // Also, don't rename an organization for runenv-python-3 package.
    { from: /@platforma-open(?!.*runenv-python-3)/g, to: `@${npmOrgName}` },

    { from: /my-org/g, to: orgName },

    { from: /block-boilerplate/g, to: blockName },
  ]);
}

function askForOptions(given: CreateBlockPartialOptions): CreateBlockOptions {
  let npmOrgName = given.npmOrgName;
  if (npmOrgName === undefined) {
    npmOrgName = readlineSync.question(
      'Write an organization name for npm. Default is "platforma-open": ',
    );
    if (npmOrgName === "") {
      npmOrgName = "platforma-open";
    }
  }

  let orgName = given.orgName ?? "";
  while (orgName.length < 1)
    orgName = readlineSync.question('Write an organization name, e.g. "my-org": ');

  let blockName = given.blockName ?? "";
  while (blockName.length < 1)
    blockName = readlineSync.question('Write a name of the block, e.g. "hello-world": ');

  let softwarePlatforms: string[] = given.softwarePlatforms ?? ["Tengo"];
  if (given.softwarePlatforms === undefined) {
    const needSoftware = readlineSync.keyInYN("Create package for block's software?");
    if (needSoftware) {
      while (softwarePlatforms.length < allPlatforms.length) {
        const index = readlineSync.keyInSelect(blockPlatformsToChoose, "Choose software platform:");
        if (index < 0) break;
        softwarePlatforms.push(blockPlatformsToChoose[index]);
      }
    }
  }

  return parseOptions({ npmOrgName, orgName, blockName, softwarePlatforms });
}

/** Validates options; Tengo is always kept, the platform list is de-duplicated and sorted. */
function parseOptions(raw: {
  npmOrgName: string;
  orgName: string;
  blockName: string;
  softwarePlatforms: string[];
}): CreateBlockOptions {
  const result = CreateBlockOptions.safeParse({
    ...raw,
    softwarePlatforms: Array.from(new Set(["Tengo", ...raw.softwarePlatforms])).sort(),
  });
  if (!result.success) {
    throw new Error(result.error.issues.map((i) => i.message).join("; "));
  }

  return result.data;
}

async function downloadAndUnpack(url: string, pathInArchive: string, outputPath: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const content = await response.blob();

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "create-repo"));
  try {
    const tmpFile = path.join(tmpDir, "packed-repo.tar.gz");
    const archiveFile = Writable.toWeb(createWriteStream(tmpFile));
    await content.stream().pipeTo(archiveFile);

    const tmpRepo = path.join(tmpDir, "unpacked-repo");
    await fs.mkdir(tmpRepo);
    await tar.x({ file: tmpFile, cwd: tmpRepo });

    await fs.cp(path.join(tmpRepo, pathInArchive), outputPath, {
      recursive: true,
      verbatimSymlinks: true,
    });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/** Removes a bunch of dependencies to the platform. */
async function removePlatform(dir: string, platform: CreateBlockPlatform) {
  const p = platform.toLowerCase();

  // Remove <PlAlert> line from MainPage.vue
  // https://regex101.com/r/oCTyHk/1
  await deleteRegexInFile(
    path.join(dir, "ui", "src", "pages", "MainPage.vue"),
    new RegExp(`.*${p}Message.*\\n`, "g"),
  );

  // Remove an output from the model.
  await deleteRegexInFile(
    path.join(dir, "model", "src", "index.ts"),
    new RegExp(`.*${p}Message.*\\n\\n`, "g"),
  );

  // This regexp represents a block of code until the empty line.
  // https://regex101.com/r/Os8kX1/1
  await deleteRegexInFile(
    path.join(dir, "workflow", "src", "main.tpl.tengo"),
    new RegExp(`.*${p}.*exec.builder.*[\\s\\S]*?\\n\\n`, "g"),
  );

  // Remove a line from the workflow output.
  // https://regex101.com/r/PkHwQ8/1
  await deleteRegexInFile(
    path.join(dir, "workflow", "src", "main.tpl.tengo"),
    new RegExp(`.*${p}Message.*\\n`, "g"),
  );

  // Remove 2 lines: the one with the language message and the one with expect
  await deleteRegexInFile(
    path.join(dir, "workflow", "src", "wf.test.ts"),
    new RegExp(`.*${p}Message.*\\n.*expect.*\\n\\n`, "g"),
  );

  await fs.rm(path.join(dir, "software", `src_${p}`), { recursive: true });

  await replaceInFile(path.join(dir, "software", "package.json"), (content) => {
    const json = JSON.parse(content);
    delete json["block-software"]["artifacts"][`hello-${p}-artifact`];
    delete json["block-software"]["entrypoints"][`hello-world-${p}`];
    return JSON.stringify(json, null, 2);
  });
}

/** Removes software directory completely and all references to it from the workspace. */
async function removePlatformsCompletely(dir: string) {
  await fs.rm(path.join(dir, "software"), { recursive: true });

  await replaceInFile(path.join(dir, "workflow", "package.json"), (content) => {
    const json = JSON.parse(content);
    delete json["dependencies"]["@platforma-open/my-org.block-boilerplate.software"];
    return JSON.stringify(json, null, 2);
  });

  await deleteRegexInFile(path.join(dir, "pnpm-workspace.yaml"), /.*- software$\n/gm);
}

async function replaceRegexInAllFiles(dir: string, patterns: { from: RegExp; to: string }[]) {
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
  return await replaceRegexInFile(fPath, what, "");
}
