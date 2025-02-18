import { notEmpty } from '@milaboratories/ts-helpers';
import type { PlTreeEntry } from '@milaboratories/pl-tree';
import type { MiddleLayerEnvironment } from './middle_layer';
import { Computable } from '@milaboratories/computable';
import type { ProjectStructure } from '../model/project_model';
import { ProjectStructureKey } from '../model/project_model';
import { allBlocks } from '../model/project_model_util';
import { constructBlockContext } from './block_ctx';
import { computableFromCfgOrRF, isActive } from './render';
import { getBlockPackInfo } from './util';

/** Returns derived general project state form the project resource */
export function activeConfigs(
  prjEntry: PlTreeEntry,
  env: MiddleLayerEnvironment,
): Computable<unknown[]> {
  return Computable.make((ctx) => {
    const prj = ctx.accessor(prjEntry).node();

    const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));
    const ret: Computable<unknown>[] = [];
    for (const { id } of allBlocks(structure)) {
      const bp = getBlockPackInfo(prj, id);
      if (bp === undefined) continue;

      const activeOutputConfigs = Object.entries(bp.cfg.outputs)
        .map(([, cfg]) => cfg)
        .filter((cfg) => isActive(cfg))
        .map((cfg) => cfg);

      if (activeOutputConfigs.length === 0) continue;

      const blockCtx = constructBlockContext(prj.persist(), id);

      for (const cfg of activeOutputConfigs)
        ret.push(
          Computable.wrapError(computableFromCfgOrRF(env, blockCtx, cfg, bp.cfg.code, bp.bpId)),
        );
    }

    return ret;
  });
}
