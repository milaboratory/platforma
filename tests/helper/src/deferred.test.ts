import { expect, test } from '@jest/globals';
import { utils } from '@milaboratories/helpers';

test('Deferred ok', async () => {
  const deferred = new utils.Deferred<number>();

  const expected = 100;

  utils.delay(1).then(() => {
    deferred.resolve(expected);
  });

  const v1 = await deferred.promise;

  expect(v1).toEqual(expected);
}, 1000);

test('Deferred bad', async () => {
  const deferred = new utils.Deferred<number>();

  const expected = 'test err';

  utils.delay(1).then(() => {
    deferred.reject(Error(expected));
  });

  await expect(async () => {
    await deferred.promise;
  }).rejects.toThrow(expected);
}, 1000);
