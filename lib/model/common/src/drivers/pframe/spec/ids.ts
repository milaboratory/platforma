import type { Branded } from '../../../branding';
import type { AnchoredPColumnId } from './selectors';
import type { FilteredPColumnId } from './filtered_column';
import canonicalize from 'canonicalize';
import type { PObjectId } from '../../../pool';
/**
 * Universal column identifier optionally anchored and optionally filtered.
 */
export type UniversalPColumnId = AnchoredPColumnId | FilteredPColumnId;

/**
 * Canonically serialized {@link UniversalPColumnId}.
 */
export type SUniversalPColumnId = Branded<PObjectId, 'SUniversalPColumnId', '__pl_model_brand_2__'>;

/**
 * Canonically serializes a {@link UniversalPColumnId} to a string.
 * @param id - The column identifier to serialize
 * @returns The canonically serialized string
 */
export function stringifyColumnId(id: UniversalPColumnId): SUniversalPColumnId {
  return canonicalize(id)! as SUniversalPColumnId;
}

/**
 * Parses a canonically serialized {@link UniversalPColumnId} from a string.
 * @param str - The string to parse
 * @returns The parsed column identifier
 */
export function parseColumnId(str: SUniversalPColumnId): UniversalPColumnId {
  return JSON.parse(str) as UniversalPColumnId;
}
