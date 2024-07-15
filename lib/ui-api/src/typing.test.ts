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
import { PlatformaConfiguration, StdCtx } from './builder';
import {
  LocalBlobHandleAndSize,
  RemoteBlobHandleAndSize,
  ValueOrErrors
} from '@milaboratory/sdk-model';
import { InferOutputsType } from './platforma';

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

test('test config content', () => {
  const platforma = PlatformaConfiguration.create<{ a: string[] }>('Heavy')
    .initialArgs({ a: [] })
    .output('cell1', makeObject({ b: getJsonField(Args, 'a') }))
    .output('cell2', mapArrayValues(getJsonField(Args, 'a'), getImmediate('v1')))
    .inputsValid(isEmpty(getJsonField(Args, 'a')))
    .sections(getImmediate([{ type: 'link', href: 'main', label: 'Main' }]))
    .done();

  assertType<
    InferOutputsType<typeof platforma>,
    {
      cell1: ValueOrErrors<{ b: string[] }>;
      cell2: ValueOrErrors<'v1'[]>;
    }
  >();

  expect(JSON.stringify((platforma as any).config).length).toBeGreaterThan(20);
});

test('test config 2', () => {
  const platforma = PlatformaConfiguration.create<{ a: string[] }>('Heavy')
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
    .output('cell2', () => 42)
    .inputsValid(isEmpty(getJsonField(Args, 'a')))
    .sections(getImmediate([{ type: 'link', href: 'main', label: 'Main' }]))
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
    }
  >();

  expect(JSON.stringify((platforma as any).config).length).toBeGreaterThan(20);
});
