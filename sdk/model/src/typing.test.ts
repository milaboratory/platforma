import {
  BlockSection,
  LocalBlobHandleAndSize,
  RemoteBlobHandleAndSize,
  ValueOrErrors
} from '@milaboratories/pl-model-common';
import { BlockModel } from './builder';
import {
  Args,
  ConfigResult,
  flatten,
  getBlobContent,
  getBlobContentAsJson,
  getBlobContentAsString,
  getDownloadedBlobContent,
  getImmediate,
  getJsonField,
  getOnDemandBlobContent,
  getResourceField,
  getResourceValueAsJson,
  isEmpty,
  It,
  MainOutputs,
  makeArray,
  makeObject,
  mapArrayValues,
  mapRecordValues
} from './config';
import { InferHrefType, InferOutputsType } from './platforma';
import { DeriveHref, StdCtx } from './bconfig';

type AssertEqual<T, Expected> = [T] extends [Expected]
  ? [Expected] extends [T]
    ? true
    : false
  : false;

export const assertType = <T, Expected>(
  ..._: AssertEqual<T, Expected> extends true ? [] : ['invalid type']
) => {
  // noop
};

type AssertExtends<T, Expected> = T extends Expected ? true : false;

export const assertTypeExtends = <T, Expected>(
  ..._: AssertExtends<T, Expected> extends true ? [] : ['invalid type']
) => {
  // noop
};

function typeTest1() {
  const a = getJsonField(Args, 'field1');
  const dd = getResourceValueAsJson<{ s: boolean; g: number }>()(
    getResourceField(MainOutputs, 'a')
  );

  const cfg1 = makeObject({
    a,
    b: 'attagaca',
    c: mapRecordValues(getJsonField(Args, 'field2'), getJsonField(It, 'b')),
    d: getJsonField(dd, 's')
  });

  type Ret = ConfigResult<
    typeof cfg1,
    StdCtx<{
      field1: number;
      field2: Record<string, { b: 'yap' }>;
    }>
  >;

  assertType<
    Ret,
    {
      a: number;
      b: 'attagaca';
      c: Record<string, 'yap'>;
      d: boolean;
    }
  >();
}

function testCreateSections<const S extends BlockSection[]>(sections: () => S): DeriveHref<S> {
  return undefined as any;
}

test('test config content', () => {
  const s1 = testCreateSections(() => [
    { type: 'delimiter' },
    { type: 'link', href: '/a1', label: 'l' },
    { type: 'link', href: '/a2', label: 'ls' }
  ]);

  assertType<typeof s1, '/a1' | '/a2'>();

  const s2 = testCreateSections(() => [{ type: 'delimiter' }]);

  assertType<typeof s2, never>();
});

test('test config content', () => {
  const platforma = BlockModel.create('Heavy')
    .withArgs<{ a: string[] }>({ a: [] })
    .argsValid(isEmpty(getJsonField(Args, 'a')))
    .output('cell1', makeObject({ b: getJsonField(Args, 'a') }))
    .output('cell2', mapArrayValues(getJsonField(Args, 'a'), getImmediate('v1')))
    .sections((r) => {
      return [
        { type: 'link', href: '/', label: 'Main' },
        { type: 'link', href: '/subsection', label: 'Subsection' }
      ];
    })
    .done();

  assertType<
    InferOutputsType<typeof platforma>,
    {
      cell1: ValueOrErrors<{ b: string[] }>;
      cell2: ValueOrErrors<'v1'[]>;
    }
  >();

  assertType<InferHrefType<typeof platforma>, '/' | '/subsection'>();

  expect(JSON.stringify((platforma as any).config).length).toBeGreaterThan(20);
});

test('test config 2', () => {
  const platforma = BlockModel.create<{ a: string[] }>('Heavy')
    .initialArgs({ a: [] })
    .output(
      'cell1',
      makeObject({
        b: getBlobContentAsString(getResourceField(MainOutputs, 'field1')),
        c: makeArray(getBlobContent(getResourceField(MainOutputs, 'field2')), 'asd'),
        d: getBlobContentAsJson<string[]>()(getResourceField(MainOutputs, 'field3')),
        e: flatten(
          makeArray(
            getBlobContentAsJson<string[]>()(getResourceField(MainOutputs, 'field3')),
            getImmediate(['asd', 'd'] as string[])
          )
        ),
        f: getDownloadedBlobContent(getResourceField(MainOutputs, 'field4')),
        g: getOnDemandBlobContent(getResourceField(MainOutputs, 'field5'))
      })
    )
    .output('cell2', (ctx) => 42)
    .output('cell3', () => undefined)
    .withArgs(isEmpty(getJsonField(Args, 'a')))
    .sections(
      () =>
        [
          { type: 'link', href: '/', label: 'Main' },
          { type: 'link', href: '/subsection', label: 'Subsection' }
        ] satisfies BlockSection[]
    )
    .done();

  assertType<
    InferOutputsType<typeof platforma>,
    {
      cell1: ValueOrErrors<{
        b: string;
        c: [Uint8Array, 'asd'];
        d: string[];
        e: string[];
        f: LocalBlobHandleAndSize;
        g: RemoteBlobHandleAndSize;
      }>;
      cell2: ValueOrErrors<number>;
      cell3: ValueOrErrors<undefined>;
    }
  >();

  assertType<InferHrefType<typeof platforma>, '/' | '/subsection'>();

  expect(JSON.stringify((platforma as any).config).length).toBeGreaterThan(20);
});
