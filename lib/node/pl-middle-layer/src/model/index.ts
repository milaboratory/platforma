export * from "./block_pack_spec";
export { type ProjectId, type ProjectListEntry, type ProjectField } from "./project_model";

export {
  ProjectMetaKey,
  ProjectCreatedTimestamp,
  ProjectLastModifiedTimestamp,
  SchemaVersionKey,
  SchemaVersionCurrent,
  ProjectStructureKey,
  ProjectResourceType,
  BlockArgsAuthorKeyPrefix,
  ProjectStructureAuthorKey,
} from "./project_model";

export * from "./sharing_model";

// The template import path. A caller reads a file, parses it, creates a project and
// applies the document — so the parser and the report types are as public as the
// `MiddleLayer.applyTemplateToProject` that consumes them. `BlockPackProvider` is here
// for the same reason: which registries to consult is the caller's decision.
export { parseProjectTemplateV1Yaml, type TemplateParseOutcome } from "./template_parser";
export {
  resolveTemplateEntries,
  parseBlockPackName,
  type BlockPackProvider,
  type KindResolution,
  type ExactResolution,
  type ResolvedEntry,
  type TemplateResolveOutcome,
} from "./template_resolve";
export {
  TemplateEntryRejected,
  type AppliedEntry,
  type TemplateApplyProblem,
  type TemplateApplyReport,
} from "./template_apply";

// The template export path. A caller renders a stored template back to a file, and reports
// every block that stood in the way of storing one, so the outcome type and the stringifier
// are as public as the `MiddleLayer.saveProjectAsTemplate` that produces them.
export {
  stringifyProjectTemplateV1,
  locationOf,
  type ProjectTemplateExportOutcome,
} from "./template_serializer";
export type { TemplateExportProblem } from "./template_export";

// The template share path. Whether a template may be shared at all is a question a UI asks about
// a template it is merely displaying, so the check and its problem type are public.
export { unshareableTemplateEntries, type TemplateShareProblem } from "./template_share";
