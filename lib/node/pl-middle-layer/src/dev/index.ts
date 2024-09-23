import { RegistryV1 } from '@milaboratory/pl-block-tools';
import path from 'path';
import { tryStat } from './util';

export const LegacyDevBlockPackMetaYaml = [RegistryV1.PlPackageYamlConfigFile];
export const LegacyDevBlockPackMetaJson = [RegistryV1.PlPackageJsonConfigFile];
export const LegacyDevBlockPackTemplate = ['backend', 'dist', 'tengo', 'tpl', 'main.plj.gz'];
export const LegacyDevBlockPackConfig = ['config', 'dist', 'config.json'];
export const LegacyDevBlockPackFrontendFolder = ['frontend', 'dist'];

export const CanonicalBlockWorkflowRequest = 'block-workflow/dist/tengo/tpl/main.plj.gz';
export const CanonicalBlockConfigRequest = 'block-model/dist/config.json';
export const CanonicalBlockUiRequestPackageJson = 'block-ui/package.json';

export const LegacyDevBlockPackFiles = [
  LegacyDevBlockPackTemplate,
  LegacyDevBlockPackConfig,
  LegacyDevBlockPackMetaYaml,
  LegacyDevBlockPackMetaJson,
  LegacyDevBlockPackFrontendFolder
];

export type DevPacketPaths = {
  /** main.plj.gz */
  readonly workflow: string;
  /** config.json */
  readonly config: string;
  /** ui dist folder */
  readonly ui: string;
};

export async function isLegacyDevPackage(packageRoot: string): Promise<boolean> {
  return (
    (await tryStat(path.join(packageRoot, ...LegacyDevBlockPackConfig))) !== undefined ||
    (await tryStat(path.join(packageRoot, ...LegacyDevBlockPackTemplate))) !== undefined
  );
}

function tryResolve(root: string, request: string): string | undefined {
  try {
    return require.resolve(request, {
      paths: [root]
    });
  } catch (err: any) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
  }
  return undefined;
}

function mustResolve(root: string, request: string): string {
  const res = tryResolve(root, request);
  if (res === undefined) throw new Error(`Can't resolve ${request} against ${root}`);
  return res;
}

export async function resolveDevPacket(
  packageRoot: string,
  ignoreErrors: true
): Promise<DevPacketPaths | undefined>;
export async function resolveDevPacket(
  packageRoot: string,
  ignoreErrors: false
): Promise<DevPacketPaths>;
export async function resolveDevPacket(
  packageRoot: string,
  ignoreErrors: boolean
): Promise<DevPacketPaths | undefined> {
  if (!path.isAbsolute(packageRoot)) packageRoot = path.resolve(packageRoot);
  if (await isLegacyDevPackage(packageRoot))
    return {
      workflow: path.join(packageRoot, ...LegacyDevBlockPackTemplate),
      config: path.join(packageRoot, ...LegacyDevBlockPackConfig),
      ui: path.join(packageRoot, ...LegacyDevBlockPackFrontendFolder)
    };
  if (ignoreErrors) {
    const workflow = tryResolve(packageRoot, CanonicalBlockConfigRequest);
    if (workflow === undefined) return undefined;
    const config = tryResolve(packageRoot, CanonicalBlockConfigRequest);
    if (config === undefined) return undefined;
    const uiPackageJson = tryResolve(packageRoot, CanonicalBlockUiRequestPackageJson);
    if (uiPackageJson === undefined) return undefined;
    return { workflow, config, ui: path.resolve(uiPackageJson, '..', 'dist') };
  } else {
    const workflow = mustResolve(packageRoot, CanonicalBlockConfigRequest);
    const config = mustResolve(packageRoot, CanonicalBlockConfigRequest);
    const uiPackageJson = mustResolve(packageRoot, CanonicalBlockUiRequestPackageJson);
    return { workflow, config, ui: path.resolve(uiPackageJson, '..', 'dist') };
  }
}
