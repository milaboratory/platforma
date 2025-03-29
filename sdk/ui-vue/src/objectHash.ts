import canonicalize from 'canonicalize';

/**
 * Calculate a hash of a JSON object
 * @param jsonObject - The JSON object to hash
 * @returns A hash of the JSON object
 */
export async function objectHash(jsonObject: NonNullable<unknown>) {
  const canonicalJson = canonicalize(jsonObject);

  if (canonicalJson === undefined) {
    throw new Error('Failed to canonicalize object: Invalid input type or structure');
  }

  const encoder = new TextEncoder();

  const data = encoder.encode(canonicalJson);

  const digest = await crypto.subtle.digest('SHA-256', data);

  const hashArray = Array.from(new Uint8Array(digest));

  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
