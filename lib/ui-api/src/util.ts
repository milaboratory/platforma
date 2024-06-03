import { TypedConfig } from './type_engine';
import { getJsonField, makeObject } from './actions';

export type PlRef = {
  blockId: string
  name: string
}

export type Ref = PlRef & {
  __isRef: true
}

export type Option = {
  ref: PlRef,
  label: string
}

function fromPlRef<Source extends TypedConfig>(source: Source) {
  return makeObject({
    __isRef: true,
    blockId: getJsonField(source, 'blockId'),
    name: getJsonField(source, 'name')
  });
}

function fromPlOption<Source extends TypedConfig>(source: Source) {
  return makeObject({
    ref: fromPlRef(getJsonField(source, 'ref')),
    label: getJsonField(source, 'label')
  });
}
