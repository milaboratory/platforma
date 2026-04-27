import type { ProjectMeta } from "./project";

/** Represents single entry in the list of projects owned by current user */
export interface ProjectListEntry {
  /** Project resource ID. */
  rid: bigint; // TODO:: remove this from public contract
  /** Unique project identifier in middle layer. Use to operate with given project. */
  id: string;
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
