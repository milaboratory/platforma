import { notEmpty } from '@milaboratories/ts-helpers';
import { PlTreeEntry } from '@milaboratories/pl-tree';
import { MiddleLayerEnvironment } from './middle_layer';
import { Computable } from '@milaboratories/computable';
import { projectFieldName, ProjectStructure, ProjectStructureKey } from '../model/project_model';
import { allBlocks } from '../model/project_model_util';
import { Pl } from '@milaboratories/pl-client';
import { BlockPackInfo } from '../model/block_pack';
import { hasActiveCfgComponents } from '../cfg_render/util';
import { Cfg, isFunctionHandle, normalizeBlockConfig } from '@platforma-sdk/model';
import { constructBlockContext } from './block_ctx';
import { computableFromCfg } from '../cfg_render/executor';

/** Returns derived general project state form the project resource */
export function activeConfigs(
  prjEntry: PlTreeEntry,
  env: MiddleLayerEnvironment
): Computable<unknown[]> {
  return Computable.make((ctx) => {
    const prj = ctx.accessor(prjEntry).node();

    const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));
    const ret: Computable<unknown>[] = [];
    for (const { id, renderingMode } of allBlocks(structure)) {
      // block-pack
      const blockPack = prj.traverse(
        {
          field: projectFieldName(id, 'blockPack'),
          assertFieldType: 'Dynamic',
          errorIfFieldNotSet: true
        },
        { field: Pl.HolderRefField, assertFieldType: 'Input', errorIfFieldNotFound: true }
      );

      const bpInfo = blockPack?.getDataAsJson<BlockPackInfo>();
      if (bpInfo?.config === undefined) continue;

      const blockConf = normalizeBlockConfig(bpInfo.config);
      const activeOutputConfigs = Object.entries(blockConf.outputs)
        .map(([, cfg]) => cfg)
        .filter((cfg) => !isFunctionHandle(cfg) && hasActiveCfgComponents(cfg))
        .map((cfg) => cfg as Cfg);

      if (activeOutputConfigs.length === 0) continue;

      const blockCtx = constructBlockContext(prj, id);

      // console.log(blockCtx.prod(ctx));

      for (const cfg of activeOutputConfigs)
        ret.push(Computable.wrapError(computableFromCfg(env.driverKit, blockCtx, cfg)));
    }

    return ret;
  });
}
