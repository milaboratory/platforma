export interface ProjectMeta {
  /** Project name */
  readonly label: string;
  /**
   * Free text the user wrote about the project. Absent when there is none — a project nobody
   * described and one whose description was cleared carry the same metadata.
   */
  readonly description?: string;
}

/**
 * A description as it is stored: trimmed, and absent when nothing is left. A description of
 * whitespace only is no description, and storing it as an empty string would make an untouched
 * item and a cleared one look different everywhere the value is compared or rendered.
 */
export function normalizeDescription(text?: string): string | undefined {
  const trimmed = text?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

/** Project metadata with a blank description left out. */
export function normalizeProjectMeta(meta: ProjectMeta): ProjectMeta {
  const description = normalizeDescription(meta.description);
  return description === undefined ? { label: meta.label } : { label: meta.label, description };
}
