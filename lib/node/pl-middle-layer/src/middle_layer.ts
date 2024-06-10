import { ComputableStableDefined } from '@milaboratory/computable';
import { ProjectListEntry } from './middle_layer/project_list';
import { ProjectMeta } from './model/project_model';
import { ResourceId } from '@milaboratory/pl-client-v2';
import { Project } from './project';

/**
 * Main access object to work with pl from UI.
 *
 * It implements an abstraction layer of projects and blocks.
 *
 * As a main entry point inside the pl, this object uses a resource attached
 * via the {@link ProjectsField} to the pl client's root, this resource
 * contains project list.
 *
 * Read about alternative roots, if isolated project lists (working environments)
 * are required.
 * */
export interface MiddleLayer {
  /** Contains a reactive list of projects along with their meta information. */
  readonly projectList: ComputableStableDefined<ProjectListEntry[]>;

  /** Creates a project with initial state and adds it to project list. */
  createProject(id: string, meta: ProjectMeta): Promise<ResourceId>;

  /** Permanently deletes project from the project list, this will result in
   * destruction of all attached objects, like files, analysis results etc. */
  deleteProject(id: string): Promise<void>;

  /** Opens a project, and starts corresponding project maintenance loop. */
  openProject(rid: ResourceId): Promise<void>;

  /** Closes the project, and deallocate all corresponding resources. */
  closeProject(rid: ResourceId): void;

  /** Returns a project access object for opened project,
   * for the given project resource id. */
  getOpenedProject(rid: ResourceId): Project;

  /** Deallocates all runtime resources consumed by this object. */
  close(): void;
}
