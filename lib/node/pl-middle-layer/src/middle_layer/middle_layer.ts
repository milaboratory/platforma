import {
  field,
  isNullResourceId,
  PlClient,
  ResourceId,
  toGlobalResourceId
} from '@milaboratory/pl-client-v2';
import { createProjectList, ProjectListEntry, ProjectsField, ProjectsResourceType } from './project_list';
import { TemporalSynchronizedTreeOps, TreeAndComputableU } from './types';
import { ProjectMeta } from '../model/project_model';
import { createProject } from '../mutator/project';
import { ComputableSU } from '@milaboratory/computable';

export type MiddleLayerOps = {
  defaultTreeOptions: TemporalSynchronizedTreeOps;
}

export const DefaultMiddleLayerOps: MiddleLayerOps = {
  defaultTreeOptions: {
    pollingInterval: 350,
    stopPollingDelay: 2500
  }
};

/** Main entry point for the frontend */
export class MiddleLayer {
  private readonly projectListTC: TreeAndComputableU<ProjectListEntry[]>;

  private constructor(
    private readonly pl: PlClient,
    private readonly projects: ResourceId,
    private readonly ops: MiddleLayerOps = DefaultMiddleLayerOps
  ) {
    this.projectListTC = createProjectList(pl, projects, ops.defaultTreeOptions);
  }

  public get projectList(): ComputableSU<ProjectListEntry[]> {
    return this.projectListTC.computable;
  }

  public async addProject(id: string, meta: ProjectMeta): Promise<ResourceId> {
    return await this.pl.withWriteTx('MLCreateProject', async tx => {
      const prj = createProject(tx, meta);
      tx.createField(field(this.projects, id), 'Dynamic', prj);
      await tx.commit();
      return await toGlobalResourceId(prj);
    });
  }

  public async removeProject(id: string): Promise<void> {
    await this.pl.withWriteTx('MLRemoveProject', async tx => {
      tx.removeField(field(this.projects, id));
      await tx.commit();
    });
  }

  public static async init(pl: PlClient): Promise<MiddleLayer> {
    const projects = await pl.withWriteTx('MLInitialization', async tx => {
      const projectsField = field(tx.clientRoot, ProjectsField);
      tx.createField(projectsField, 'Dynamic');
      const projectsFieldData = await tx.getField(projectsField);
      if (isNullResourceId(projectsFieldData.value)) {
        const projects = tx.createEphemeral(ProjectsResourceType);
        tx.lock(projects);

        tx.setField(projectsField, projects);

        await tx.commit();

        return await projects.globalId;
      } else {
        return projectsFieldData.value;
      }
    });
    return new MiddleLayer(pl, projects);
  }
}

