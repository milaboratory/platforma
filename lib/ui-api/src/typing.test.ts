import { ConfigResult } from './type_engine';
import {
  getImmediate,
  getJsonField,
  getResourceField,
  getResourceValueAsJson,
  Args, It,
  makeObject,
  mapRecordValues,
  MainOutputs, isEmpty, mapArrayValues, getBlobContentAsString, getBlobContent, getBlobContentAsJson
} from './actions';
import { BlockConfigBuilder, ResolveOutputsType, StdCtx } from './builder';

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

type AssertExtends<T, Expected> = T extends Expected
  ? true
  : false

export const assertTypeExtends = <T, Expected>(
  ..._: AssertExtends<T, Expected> extends true ? [] : ['invalid type']
) => {
  // noop
};


function typeTest1() {
  const a = getJsonField(Args, 'field1');
  const dd = getResourceValueAsJson<{ s: boolean, g: number }>()(getResourceField(MainOutputs, 'a'));

  const cfg1 = makeObject({
    a,
    b: 'attagaca',
    c: mapRecordValues(
      getJsonField(Args, 'field2'),
      getJsonField(It, 'b')
    ),
    d: getJsonField(dd, 's')
  });

  type Ret = ConfigResult<typeof cfg1, StdCtx<{
    field1: number,
    field2: Record<string, { b: 'yap' }>
  }>>

  assertType<Ret, {
    a: number,
    b: 'attagaca',
    c: Record<string, 'yap'>,
    d: boolean
  }>();
}

test('test config content', () => {
  const blockConfig1 = BlockConfigBuilder.create<{ a: string[] }>('Heavy')
    .initialArgs({ a: [] })
    .output('cell1', makeObject({ b: getJsonField(Args, 'a') }))
    .output('cell2', mapArrayValues(getJsonField(Args, 'a'), getImmediate('v1')))
    .canRun(isEmpty(getJsonField(Args, 'a')))
    .sections(getImmediate([
      { id: 'main', title: 'Main' }
    ]))
    .build();

  assertType<ResolveOutputsType<typeof blockConfig1>, { cell1: { b: string[] }, cell2: 'v1'[] }>();

  expect(JSON.stringify(blockConfig1).length).toBeGreaterThan(20);
});

test('test config 2', () => {
  const blockConfig1 = BlockConfigBuilder.create<{ a: string[] }>('Heavy')
    .initialArgs({ a: [] })
    .output('cell1', makeObject({
      b: getBlobContentAsString(getResourceField(MainOutputs, 'field1')),
      c: getBlobContent(getResourceField(MainOutputs, 'field2')),
      d: getBlobContentAsJson<string[]>()(getResourceField(MainOutputs, 'field3'))
    }))
    .canRun(isEmpty(getJsonField(Args, 'a')))
    .sections(getImmediate([
      { id: 'main', title: 'Main' }
    ]))
    .build();

  assertType<ResolveOutputsType<typeof blockConfig1>, {
    cell1: {
      b: string,
      c: Uint8Array,
      d: string[]
    }
  }>();

  expect(JSON.stringify(blockConfig1).length).toBeGreaterThan(20);
});
