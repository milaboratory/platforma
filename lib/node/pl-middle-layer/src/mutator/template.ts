import type { PlTransaction, ResourceRef, SignedResourceId } from "@milaboratories/pl-client";
import { field, isNullSignedResourceId, resourceIdToString } from "@milaboratories/pl-client";
import { randomUUID } from "node:crypto";
import type { StoredTemplateData, TemplateId } from "../middle_layer/template_list";
import {
  TemplateCreatedTimestamp,
  TemplateLabelKey,
  TemplateResourceType,
} from "../middle_layer/template_list";

/**
 * Creates one `UserTemplate` inside the given write transaction and attaches it to the
 * templates list under a freshly minted uuid field.
 *
 * Create and attach are the same transaction on purpose: an ephemeral resource nothing
 * holds is collectable, so the list field is what keeps the template alive.
 *
 * The document rides in the immutable `data` blob, set once here and never altered; only
 * the label and the creation timestamp go to KV, and only the label is ever written again.
 *
 * @returns the new template resource; the caller reads its `globalId` after the commit.
 */
export function createTemplate(
  tx: PlTransaction,
  listRid: SignedResourceId,
  label: string,
  data: StoredTemplateData,
): ResourceRef {
  const tpl = tx.createEphemeral(TemplateResourceType, JSON.stringify(data));
  tx.lock(tpl);
  tx.setKValue(tpl, TemplateLabelKey, JSON.stringify(label));
  tx.setKValue(tpl, TemplateCreatedTimestamp, String(Date.now()));
  tx.createField(field(listRid, randomUUID()), "Dynamic", tpl);
  return tpl;
}

/** Renames a stored template. Touches the label KV entry and nothing else, so the stored
 *  document stays byte-identical. */
export function renameTemplate(tx: PlTransaction, rid: SignedResourceId, label: string): void {
  tx.setKValue(rid, TemplateLabelKey, JSON.stringify(label));
}

/**
 * Detaches a template from the templates list, which is what destroys it — the list field is
 * the only thing holding the ephemeral resource.
 *
 * The field name is a uuid unrelated to the template id, so the field carrying the template
 * is found by value, the same way a project is removed from the project list.
 */
export async function deleteTemplate(
  tx: PlTransaction,
  listRid: SignedResourceId,
  id: TemplateId,
): Promise<void> {
  const fieldName = await findTemplateField(tx, listRid, id);
  if (fieldName === undefined) throw new Error(`Template ${id} not found in template list.`);
  tx.removeField(field(listRid, fieldName));
}

//
// Internals
//

async function findTemplateField(
  tx: PlTransaction,
  listRid: SignedResourceId,
  id: TemplateId,
): Promise<string | undefined> {
  const data = await tx.getResourceData(listRid, true);
  for (const f of data.fields) {
    if (isNullSignedResourceId(f.value)) continue;
    if (resourceIdToString(f.value) === (id as string)) return f.name;
  }
  return undefined;
}
