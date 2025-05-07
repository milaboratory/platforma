import type { Branded } from '../../../branding';
import { isPColumnSpec, type PObjectSpec } from '../../../pool';
import { getAxesId } from './spec';
import canonicalize from 'canonicalize';
export type NativePObjectId = Branded<string, 'NativePObjectId'>;

export function deriveNativeId(spec: PObjectSpec): NativePObjectId {
  const result: Record<string, unknown> = {
    kind: spec.kind,
    name: spec.name,
  };
  if (spec.domain !== undefined)
    result.domain = spec.domain;
  if (isPColumnSpec(spec))
    result.axesSpec = getAxesId(spec.axesSpec);
  return canonicalize(result) as NativePObjectId;
}
