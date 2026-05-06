import type { ProjectId } from "@milaboratories/pl-model-common";
import type { ProjectMeta } from "./project";

/** Represents single entry in the list of projects owned by current user */
export interface ProjectListEntry {
  /** Unique project identifier in middle layer. Use to operate with given project. */
  id: ProjectId;
  /** Creation timestamp. */
  created: Date;
  /** Last modification timestamp. */
  lastModified: Date;
  /** True if project is opened */
  opened: boolean;
  /** Project meta, namely label */
  meta: ProjectMeta;
}

// export type ProjectList = ProjectListEntry[];
