import { PlError, PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import { PObject, PObjectId, PObjectSpec, ValueOrError } from '@platforma-sdk/model';
import { notEmpty } from '@milaboratories/ts-helpers';
import assert from 'assert';
import { Writable } from 'utility-types';
import { deriveLocalPObjectId, deriveUnstablePObjectId } from './data';

/** Represents specific staging or prod ctx data */
export interface RawPObjectCollection {
  /** true if no new results are expected */
  readonly locked: boolean;
  /** results by name */
  readonly results: Map<string, RawPObjectEntry>;
}

/** Single result in a particular ctx */
export interface RawPObjectEntry {
  /**
   * true - means this result has data field, however it may still be not ready
   * false - means it can be derived that this result incarnation is spec-only
   * undefined - means that it is not yet known
   * */
  readonly hasData?: boolean;

  /** Result may be added even if there is no data associated with it */
  readonly spec?: PObjectSpec;

  /**
   * Returns data accessor, or error, or undefined if data not yet available.
   * If data fuinction itself is not defined, this means that corresponding context
   * was not rendered.
   * */
  data?(): ValueOrError<PlTreeNodeAccessor, string> | undefined;
}

const BContextValuePrefix = 'values/';
const BContextValueSpecSuffix = '.spec';
const BContextValueDataSuffix = '.data';

export function parseRawPObjectCollection(
  node: PlTreeNodeAccessor,
  errorOnUnknownField: boolean = true,
  ignoreFieldErrors: boolean = false,
  prefix: string = ''
): RawPObjectCollection {
  const entryPattern = /^(?<name>.*)\.(?<type>spec|data)$/;
  const results = new Map<string, Writable<RawPObjectEntry>>();
  for (const fieldName of node.listInputFields()) {
    const match = fieldName.match(entryPattern);
    if (!match) {
      if (errorOnUnknownField) throw new Error(`unexpected field name ${fieldName}`);
      else continue;
    }

    let name = notEmpty(match.groups?.name);
    if (!name.startsWith(prefix)) {
      if (errorOnUnknownField) throw new Error(`unexpected field name ${fieldName}`);
      else continue;
    }
    name = name.slice(prefix.length);

    const type = notEmpty(match.groups?.type) as 'spec' | 'data';
    let result = results.get(name);
    if (result === undefined) {
      result = {};
      results.set(name, result);
    }

    switch (type) {
      case 'spec':
        result.spec = node
          .traverse({
            field: fieldName,
            ignoreError: ignoreFieldErrors,
            pureFieldErrorToUndefined: ignoreFieldErrors
          })
          ?.getDataAsJson();
        break;
      case 'data':
        result.hasData = true;
        result.data = () =>
          node.traverseOrError({
            field: fieldName,
            ignoreError: ignoreFieldErrors
          });
      default:
        // other value types planned
        continue;
    }
  }

  const locked = node.getInputsLocked();
  if (locked)
    for (const [, result] of results) if (result.data === undefined) result.hasData = false;

  return { locked, results };
}

export function parseFinalPObjectCollection(
  node: PlTreeNodeAccessor,
  errorOnUnknownField: boolean = true,
  prefix: string = '',
  resolvePath: string[],
): Record<string, PObject<PlTreeNodeAccessor>> {
  if (!node.getIsReadyOrError()) throw new Error('resource is not ready');
  const rawCollection = parseRawPObjectCollection(node, errorOnUnknownField, false, prefix);
  assert(rawCollection.locked);
  const collection: Record<string, PObject<PlTreeNodeAccessor>> = {};
  for (const [outputName, result] of rawCollection.results) {
    if (result.spec === undefined) throw new Error(`no spec for key ${outputName}`);
    if (result.hasData !== true || result.data === undefined)
      throw new Error(`no data for key ${outputName}`);
    const data = result.data();
    if (data === undefined) throw new Error(`no data for key ${outputName}`);
    if (!data.ok) throw new PlError(data.error);
    collection[outputName] = {
      id: resolvePath.length === 0
        ? deriveUnstablePObjectId(result.spec, data.value) // for old blocks opened in new desktop
        : deriveLocalPObjectId(resolvePath, outputName),
      spec: result.spec,
      data: data.value
    };
  }
  return collection;
}
