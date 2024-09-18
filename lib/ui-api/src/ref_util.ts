import { getJsonField, makeObject, TypedConfig } from './config';

export function fromPlRef<Source extends TypedConfig>(source: Source) {
  return makeObject({
    __isRef: true,
    blockId: getJsonField(source, 'blockId'),
    name: getJsonField(source, 'name')
  });
}

export function fromPlOption<Source extends TypedConfig>(source: Source) {
  return makeObject({
    ref: fromPlRef(getJsonField(source, 'ref')),
    label: getJsonField(source, 'label')
  });
}
