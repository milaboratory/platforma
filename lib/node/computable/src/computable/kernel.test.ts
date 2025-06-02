import { test } from 'vitest';
import { ComputableKernel, UnwrapComputables } from './kernel';

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

declare const __some_symbol__: unique symbol;
type BrandBigInt<B> = bigint & { [__some_symbol__]: B };

/** Global resource id */
export type TheBrandedBigInt = BrandBigInt<'awesome'>;

declare function createFakeCompute<T>(t: T): ComputableKernel<T>;

declare function createFakeComputeMaybe<T>(t: T): ComputableKernel<T> | undefined;

declare function unwrap<T>(t: T): UnwrapComputables<T>;

declare function tuple2<T1, T2>(t1: T1, t2: T2): [T1, T2];

function a() {
  const c0 = ['asd', createFakeCompute(2)];
  const c1 = {
    a: createFakeComputeMaybe({
      b: 1,
      c: createFakeComputeMaybe('asdsd' as string | undefined),
      d: createFakeCompute(2n as TheBrandedBigInt | undefined)
    }),
    b: tuple2(
      'D',
      createFakeCompute({
        d: 2,
        k: createFakeCompute({ b: 1 })
      })
    )
  };
  const b = unwrap(c1);
  assertType<
    typeof b,
    {
      a: { b: number; c: string | undefined; d: TheBrandedBigInt | undefined } | undefined;
      b: [
        string,
        {
          d: number;
          k: { b: number };
        }
      ];
    }
  >();
}

test('noop', () => {});
