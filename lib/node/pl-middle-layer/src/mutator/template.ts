import type {
  AnyResourceRef,
  PlTransaction,
  ResourceRef,
  SignedResourceId,
} from "@milaboratories/pl-client";
import { field } from "@milaboratories/pl-client";
import { normalizeDescription } from "@milaboratories/pl-model-middle-layer";
import { randomUUID } from "node:crypto";
import type { StoredTemplateData, TemplateId } from "../middle_layer/template_list";
import {
  TemplateCreatedTimestamp,
  TemplateDescriptionKey,
  TemplateLabelKey,
  TemplateResourceType,
} from "../middle_layer/template_list";
import { listedById, notListedError } from "./list";

/**
 * Creates one `UserTemplate` inside the given write transaction and attaches it to the
 * templates list under a freshly minted uuid field.
 *
 * Create and attach are the same transaction on purpose: an ephemeral resource nothing
 * holds is collectable, so the list field is what keeps the template alive.
 *
 * The document rides in the immutable `data` blob, set once here and never altered. The label,
 * the creation timestamp and the description live in KV beside it; the label and the description
 * may be written again later, the timestamp never is. A blank description stores nothing, the
 * same as {@link setTemplateDescription} does.
 *
 * @returns the new template resource; the caller reads its `globalId` after the commit.
 */
export function createTemplate(
  tx: PlTransaction,
  listRid: SignedResourceId,
  meta: { readonly label: string; readonly description?: string },
  data: StoredTemplateData,
): ResourceRef {
  const tpl = tx.createEphemeral(TemplateResourceType, JSON.stringify(data));
  tx.lock(tpl);
  tx.setKValue(tpl, TemplateLabelKey, JSON.stringify(meta.label));
  tx.setKValue(tpl, TemplateCreatedTimestamp, String(Date.now()));
  const description = normalizeDescription(meta.description);
  if (description !== undefined)
    tx.setKValue(tpl, TemplateDescriptionKey, JSON.stringify(description));
  tx.createField(field(listRid, randomUUID()), "Dynamic", tpl);
  return tpl;
}

/** Renames a stored template. Touches the label KV entry and nothing else, so the stored
 *  document stays byte-identical. */
export function renameTemplate(tx: PlTransaction, rid: SignedResourceId, label: string): void {
  tx.setKValue(rid, TemplateLabelKey, JSON.stringify(label));
}

/**
 * Sets what a stored template says about itself. Blank removes the entry rather than storing an
 * empty one, so a template that was never described and one whose description was cleared are
 * stored the same way.
 */
export function setTemplateDescription(
  tx: PlTransaction,
  rid: AnyResourceRef,
  description: string,
): void {
  const wanted = normalizeDescription(description);
  if (wanted === undefined) tx.deleteKValue(rid, TemplateDescriptionKey);
  else tx.setKValue(rid, TemplateDescriptionKey, JSON.stringify(wanted));
}

/**
 * Detaches a template from the templates list, which is what destroys it — the list field is
 * the only thing holding the ephemeral resource.
 */
export async function deleteTemplate(
  tx: PlTransaction,
  listRid: SignedResourceId,
  id: TemplateId,
): Promise<void> {
  const entry = (await listedById(tx, listRid)).get(id);
  if (entry === undefined) throw notListedError("Template", id);
  tx.removeField(field(listRid, entry.fieldName));
}
