import path from 'path';
import { tryLoadFile } from '../util';
import {
  BlockPackDescriptionFromPackageJsonRaw,
  ResolvedBlockPackDescriptionFromPackageJson,
  BlockPackDescriptionAbsolute
} from './model';
import { BlockPackId } from './model/block_pack_id';
import { notEmpty } from '@milaboratory/ts-helpers';
import { SemVer } from '../common_types';

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

export async function loadPackDescriptionFromSource(srcRoot: string): Promise<BlockPackDescriptionAbsolute> {
  const fullPackageJsonPath = path.resolve(srcRoot, 'package.json');
  const packageJson = await tryLoadFile(fullPackageJsonPath, (buf) =>
    JSON.parse(buf.toString('utf-8'))
  );
  const descriptionNotParsed = packageJson[BlockDescriptionPackageJsonField];
  if (descriptionNotParsed === undefined)
    throw new Error(
      `Block description (field ${BlockDescriptionPackageJsonField}) not found in ${fullPackageJsonPath}.`
    );
  const descriptionRaw = {
    ...BlockPackDescriptionFromPackageJsonRaw.parse(descriptionNotParsed),
    id: {
      ...parsePackageName(
        notEmpty(packageJson['name'], `"name" not found in ${fullPackageJsonPath}`)
      ),
      version: SemVer.parse(packageJson['version'])
    }
  };
  return await ResolvedBlockPackDescriptionFromPackageJson(srcRoot).parseAsync(descriptionRaw);
}
