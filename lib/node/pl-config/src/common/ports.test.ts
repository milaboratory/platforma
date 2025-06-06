import { test } from 'vitest';
import { getPorts } from './ports';

test('should pick free ports without problems', async ({ expect }) => {
  const got = await getPorts({ type: 'pickFree' });
  expect(got.grpc).toBeTypeOf('number');
  expect(got.monitoring).toBeTypeOf('number');
  expect(got.debug).toBeTypeOf('number');
  expect(got.httpEndpoint).toBeTypeOf('number');
  console.log('ports: ', got.grpc, got.monitoring, got.debug, got.httpEndpoint);
});

test('should pick all ports when the mode is random and a range is tight', async ({ expect }) => {
  const got = await getPorts({
    type: 'random',
    from: 1,
    to: 5,
  });

  expect([got.grpc, got.debug, got.monitoring, got.httpEndpoint].sort()).toEqual([1, 2, 3, 4]);
});
