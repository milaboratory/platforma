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
export { validateTemplateV1ForApply } from "./template_validate";
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
  applyProjectTemplateV1,
  type AddBlockOutcome,
  type AddBlockRequest,
  type AppliedEntry,
  type TemplateApplyApi,
  type TemplateApplyOutcome,
  type TemplateApplyProblem,
  type TemplateApplyReport,
} from "./template_apply";
