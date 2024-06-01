import { InferConfResultType, PlResourceEntry } from './type_engine';
import {
  getJsonField,
  getResourceField,
  getResourceValueAsJson,
  Inputs, It,
  makeObject,
  mapRecordValues,
  Outputs
} from './actions';

type AssertEqual<T, Expected> = [T] extends [Expected]
  ? [Expected] extends [T]
    ? true
    : false
  : false

export const assertType = <T, Expected>(
  ..._: AssertEqual<T, Expected> extends true ? [] : ['invalid type']
) => {
  // noop
};

function a() {
  const a = getJsonField(Inputs, 'field1');
  const dd = getResourceValueAsJson<{ s: boolean, g: number }>()(getResourceField(Outputs, 'a'));

  const cfg1 = makeObject({
    a,
    b: 'attagaca',
    c: mapRecordValues(
      getJsonField(Inputs, 'field2'),
      getJsonField(It, 'b')
    ),
    d: getJsonField(dd, 's')
  });

  type Ret = InferConfResultType<typeof cfg1, {
    $inputs: {
      field1: number,
      field2: Record<string, { b: 'yap' }>
    },
    $outputs: PlResourceEntry
  }>

  assertType<Ret, {
    a: number,
    b: 'attagaca',
    c: Record<string, 'yap'>,
    d: boolean
  }>();
}

test('noop', () => {
});
