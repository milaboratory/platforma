import { toBytes } from './util';

test('test toBytes 1', () => {
  const arr = new Uint8Array([1, 2, 3]);
  expect(toBytes(arr)).toEqual(arr);
});

test('test toBytes 2', () => {
  expect(toBytes('\x01\x02\x03')).toEqual(
    Buffer.from(new Uint8Array([1, 2, 3]))
  );
});
