import { ConfigResult, PlResourceEntry } from './type_engine';
import {
  getImmediate,
  getJsonField,
  getResourceField,
  getResourceValueAsJson,
  Inputs, It,
  makeObject,
  mapRecordValues,
  Outputs
} from './actions';
import { BlockConfig, blockConfigFactory, Section } from './std';

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

  type Ret = ConfigResult<typeof cfg1, {
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

function typeTest2() {
  const blockConfig1 = blockConfigFactory<{ a: string }>()(
    getImmediate({
      canRun: true,
      sections: [
        { id: 'main', title: 'Main' }
      ]
    }),
    getImmediate('the_state')
  );

  assertTypeExtends<typeof blockConfig1, BlockConfig>();

  const blockConfig2 = blockConfigFactory<{ a: string }>()(
    getImmediate({
      canRun: true,
      sections: [
        { id: 'main', title1: 'Main' }
      ]
    }),
    getImmediate('the_state')
  );

  assertTypeExtends<typeof blockConfig2, never>();
}

test('test config content', () => {
  const blockConfig1 = blockConfigFactory<{ a: string }>()(
    getImmediate({
      canRun: true,
      sections: [
        { id: 'main', title: 'Main' }
      ]
    }),
    getImmediate('the_state')
  );

  expect(JSON.stringify(blockConfig1).length).toBeGreaterThan(20);
});
