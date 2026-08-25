import type { PruningFunction } from "@milaboratories/pl-tree";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import type {
  Filter,
  PlClient,
  PlTransaction,
  ResourceType,
  SignedResourceId,
} from "@milaboratories/pl-client";
import {
  field,
  isNullSignedResourceId,
  resourceIdToString,
  resourceTypesEqual,
  treeFilter,
} from "@milaboratories/pl-client";
import type { TreeAndComputableU } from "./types";
import { Computable } from "@milaboratories/computable";
import type { MiddleLayerEnvironment } from "./middle_layer";
import { notEmpty } from "@milaboratories/ts-helpers";
import type { Branded, ProjectTemplateV1 } from "@milaboratories/pl-model-common";
import type { TemplateExportProblem } from "../model/template_export";
import type { TemplateShareProblem } from "../model/template_share";
import type { ShareId } from "../model/sharing_model";
import type { AppliedEntry, TemplateApplyProblem } from "../model/template_apply";
import type { ProjectId } from "../model/project_model";

export const TemplatesField = "templates";
export const TemplatesResourceType: ResourceType = { name: "Templates", version: "1" };
export const TemplateResourceType: ResourceType = { name: "UserTemplate", version: "1" };

/** Mutable: the only part of a stored template a rename may touch. */
export const TemplateLabelKey = "TemplateLabel";
export const TemplateCreatedTimestamp = "TemplateCreated";

/**
 * Unique template identifier in middle layer, the stringified signed resource id of the
 * `UserTemplate`. Branded so it cannot be confused with a {@link ProjectId} — both are
 * stringified resource ids and every template method takes one of them.
 */
export type TemplateId = Branded<string, "TemplateId">;

/**
 * Immutable `data` on a UserTemplate: the document plus what was true when it was taken.
 *
 * The document lives here and never in KV: KV is listed and fully re-read on every poll,
 * while resource data syncs incrementally, and a template document is a multi-kilobyte
 * value that never changes.
 */
export interface StoredTemplateData {
  schemaVersion: 1;
  document: ProjectTemplateV1;
  /** Provenance, display only; absent for a template that arrived as a share. */
  sourceProjectLabel?: string;
  /** Login of the sender, when it arrived as a share. */
  sender?: string;
}

/** Decodes the immutable `data` blob of a `UserTemplate` read through a transaction. The
 *  single raw-decode site; the tree side reads the same JSON with `getDataAsJson`. */
export function decodeStoredTemplateData(data: Uint8Array): StoredTemplateData {
  return JSON.parse(Buffer.from(data).toString("utf-8")) as StoredTemplateData;
}

/** One template as the template list surfaces it. */
export interface TemplateListEntry {
  /** Unique template identifier in middle layer. Use to operate with the given template. */
  id: TemplateId;
  /** The mutable label, the only part a rename changes. */
  label: string;
  created: Date;
  /** Number of blocks the stored document lists — derived, not stored. */
  blockCount: number;
  sourceProjectLabel?: string;
  sender?: string;
}

/** What saving a project as a template yields: the stored template, or every block in the way. */
export type SaveProjectAsTemplateOutcome =
  | { readonly ok: true; readonly templateId: TemplateId }
  | { readonly ok: false; readonly problems: readonly TemplateExportProblem[] };

/** What sharing a stored template yields: the share's logical id, or every entry in the way. */
export type ShareTemplateOutcome =
  | { readonly ok: true; readonly shareId: ShareId }
  | { readonly ok: false; readonly problems: readonly TemplateShareProblem[] };

/**
 * What applying a stored template yields.
 *
 * `ok: false` carries no project id because no project was created: nothing is written
 * until every entry has an installable block.
 */
export type CreateProjectFromTemplateOutcome =
  | {
      readonly ok: true;
      readonly projectId: ProjectId;
      readonly added: readonly AppliedEntry[];
    }
  | { readonly ok: false; readonly problems: readonly TemplateApplyProblem[] };

/**
 * Resolves the templates-list resource on the transaction's client root, lazily creating (and
 * locking) an empty one when the {@link TemplatesField} is not yet populated. Returns its signed
 * id. Used when writing into a root that may have no templates list yet, e.g. a template landing
 * in a recipient's root.
 */
export async function ensureTemplateListRid(tx: PlTransaction): Promise<SignedResourceId> {
  const templatesField = field(tx.clientRoot, TemplatesField);
  tx.createField(templatesField, "Dynamic");
  const fData = await tx.getField(templatesField);
  if (isNullSignedResourceId(fData.value)) {
    const ref = tx.createEphemeral(TemplatesResourceType);
    tx.lock(ref);
    tx.setField(templatesField, ref);
    return await ref.globalId;
  }
  return fData.value;
}

export const TemplatesListTreePruningFunction: PruningFunction = (resource) => {
  if (!resourceTypesEqual(resource.type, TemplatesResourceType)) return [];
  return resource.fields;
};

export const templatesListFieldFilter: Filter = treeFilter.resourceTypeEq(
  TemplatesResourceType.name,
);

export async function createTemplateList(
  pl: PlClient,
  rid: SignedResourceId,
  env: MiddleLayerEnvironment,
): Promise<TreeAndComputableU<TemplateListEntry[]>> {
  const tree = await SynchronizedTreeState.init(
    pl,
    rid,
    {
      ...env.ops.defaultTreeOptions,
      pruning: TemplatesListTreePruningFunction,
      fieldFilter: templatesListFieldFilter,
    },
    env.logger,
  );

  const c = Computable.make((ctx) => {
    const node = ctx.accessor(tree.entry()).node();
    if (node === undefined) return undefined;
    const result: TemplateListEntry[] = [];

    // Templates list resource keeps templates assigned to fields. Each field name is a UUID
    for (const field of node.listDynamicFields()) {
      const tpl = node.traverse(field);
      if (tpl === undefined) continue;
      const data = tpl.getDataAsJson<StoredTemplateData>();
      // A template whose data has not synced yet is not an entry with unknown content —
      // it is an entry we cannot describe at all, so it stays out of the list until it has.
      if (data === undefined) continue;
      const label = notEmpty(tpl.getKeyValueAsJson<string>(TemplateLabelKey));
      const created = notEmpty(tpl.getKeyValueAsJson<number>(TemplateCreatedTimestamp));
      result.push({
        id: resourceIdToString(tpl.id) as TemplateId,
        label,
        created: new Date(created),
        blockCount: data.document.blocks.length,
        ...(data.sourceProjectLabel !== undefined
          ? { sourceProjectLabel: data.sourceProjectLabel }
          : {}),
        ...(data.sender !== undefined ? { sender: data.sender } : {}),
      });
    }
    result.sort((a, b) => b.created.valueOf() - a.created.valueOf());
    return result;
  }).withStableType();

  return { computable: c, tree };
}
