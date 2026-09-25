import type { PlTransaction, SignedResourceId } from "@milaboratories/pl-client";
import { isNullSignedResourceId, resourceIdToString } from "@milaboratories/pl-client";

/** One entry of a list resource: the field holding it and the resource that field points at. */
export interface ListedEntry {
  readonly fieldName: string;
  readonly rid: SignedResourceId;
}

/** The kinds of list a root keeps, as a not-found message names them. */
export type ListedKind = "Project" | "Template";

/**
 * Every entry of a list resource — the project list or the template list — keyed by the string
 * form of the resource id it points at, which is what a project or template id is.
 *
 * A list field's name is a uuid unrelated to the id of what it holds, so an entry is only ever
 * found by value. Fields that point at nothing yet are left out.
 */
export async function listedById(
  tx: PlTransaction,
  listRid: SignedResourceId,
): Promise<Map<string, ListedEntry>> {
  const data = await tx.getResourceData(listRid, true);
  const entries = new Map<string, ListedEntry>();
  for (const f of data.fields) {
    if (isNullSignedResourceId(f.value)) continue;
    entries.set(resourceIdToString(f.value), { fieldName: f.name, rid: f.value });
  }
  return entries;
}

/** What is thrown for an id the list does not hold, worded the same for every list. */
export function notListedError(kind: ListedKind, id: string): Error {
  return new Error(`${kind} ${id} not found in the ${kind.toLowerCase()} list.`);
}
