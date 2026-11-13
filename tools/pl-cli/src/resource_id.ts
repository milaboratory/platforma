import {
  asSignedResourceId,
  createSignedResourceId,
  isLocalResourceId,
  resourceIdFromString,
  type SignedResourceId,
} from "@milaboratories/pl-client";

/**
 * Admin and controller roles do not need resource signatures: an ID without a signature
 * is accepted by the backend for these roles.
 */
export function parseResourceId(raw: string): SignedResourceId {
  const str = raw.trim();
  if (str.includes("|")) return asSignedResourceId(str);

  let id: bigint | undefined = resourceIdFromString(str);
  if (id === undefined && /^\d+$/.test(str)) id = BigInt(str);
  if (id === undefined || id === 0n || isLocalResourceId(id))
    throw new Error(`not a global resource ID: ${raw}`);

  return createSignedResourceId(id);
}
