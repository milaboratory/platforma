import path from 'path';
import { tryLoadFile } from '../util';
import { ResolvedBlockPackDescriptionFromPackageJson, BlockPackDescriptionAbsolute } from './model';
import { notEmpty } from '@milaboratory/ts-helpers';
import fsp from 'node:fs/promises';
import {
  BlockPackDescriptionFromPackageJsonRaw,
  BlockPackDescriptionRaw,
  BlockPackId,
  BlockPackMetaDescriptionRaw,
  SemVer
} from '@milaboratory/pl-middle-layer-model';

export const BlockDescriptionPackageJsonField = 'block';

const ConventionPackageNamePattern =
  /(?:@[a-zA-Z0-9-.]+\/)?(?<organization>[a-zA-Z0-9-]+)\.(?<name>[a-zA-Z0-9-]+)/;

export function parsePackageName(packageName: string): Pick<BlockPackId, 'organization' | 'name'> {
  const match = packageName.match(ConventionPackageNamePattern);
  if (!match)
    throw new Error(
      `Malformed package name (${packageName}), can't infer organization and block pack name.`
    );
  const { name, organization } = match.groups!;
  return { name, organization };
}

export async function tryLoadPackDescription(
  moduleRoot: string
): Promise<BlockPackDescriptionAbsolute | undefined> {
  const fullPackageJsonPath = path.resolve(moduleRoot, 'package.json');
  try {
    const packageJson = await tryLoadFile(fullPackageJsonPath, (buf) =>
      JSON.parse(buf.toString('utf-8'))
    );
    if (packageJson === undefined) return undefined;
    const descriptionNotParsed = packageJson[BlockDescriptionPackageJsonField];
    if (descriptionNotParsed === undefined) return undefined;
    const descriptionRaw = {
      ...BlockPackDescriptionFromPackageJsonRaw.parse(descriptionNotParsed),
      id: {
        ...parsePackageName(
          notEmpty(packageJson['name'], `"name" not found in ${fullPackageJsonPath}`)
        ),
        version: SemVer.parse(packageJson['version'])
      }
    };
    const descriptionParsingResult =
      await ResolvedBlockPackDescriptionFromPackageJson(moduleRoot).safeParseAsync(descriptionRaw);
    if (descriptionParsingResult.success) return descriptionParsingResult.data;
    return undefined;
  } catch (e: any) {
    return undefined;
  }
}

export async function loadPackDescriptionRaw(moduleRoot: string): Promise<BlockPackDescriptionRaw> {
  const fullPackageJsonPath = path.resolve(moduleRoot, 'package.json');
  const packageJson = JSON.parse(await fsp.readFile(fullPackageJsonPath, { encoding: 'utf-8' }));
  const descriptionNotParsed = packageJson[BlockDescriptionPackageJsonField];
  if (descriptionNotParsed === undefined)
    throw new Error(
      `Block description (field ${BlockDescriptionPackageJsonField}) not found in ${fullPackageJsonPath}.`
    );
  return {
    ...BlockPackDescriptionFromPackageJsonRaw.parse(descriptionNotParsed),
    id: {
      ...parsePackageName(
        notEmpty(packageJson['name'], `"name" not found in ${fullPackageJsonPath}`)
      ),
      version: SemVer.parse(packageJson['version'])
    }
  };
}

export async function loadPackDescription(
  moduleRoot: string
): Promise<BlockPackDescriptionAbsolute> {
  const descriptionRaw = await loadPackDescriptionRaw(moduleRoot);
  return await ResolvedBlockPackDescriptionFromPackageJson(moduleRoot).parseAsync(descriptionRaw);
}
