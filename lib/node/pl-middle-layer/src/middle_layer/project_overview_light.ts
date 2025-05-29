import { notEmpty } from '@milaboratories/ts-helpers';
import type { PlTreeEntry } from '@milaboratories/pl-tree';
import { Computable } from '@milaboratories/computable';
import type { ProjectStructure } from '../model/project_model';
import { ProjectStructureKey } from '../model/project_model';
import { allBlocks } from '../model/project_model_util';

export type ProjectOverviewLight = {
  readonly listOfBlocks: string[];
};

/** Returns derived general project state form the project resource */
export function projectOverviewLight(
  prjEntry: PlTreeEntry,
): Computable<ProjectOverviewLight> {
  return Computable.make((ctx) => {
    const prj = ctx.accessor(prjEntry).node();

    const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));

    return {
      listOfBlocks: [...allBlocks(structure)].map((b) => b.id),
    };
  });
}
