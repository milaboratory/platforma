import { randomUUID } from 'node:crypto';
import { FSStorage, S3Storage, storageByUrl } from './storage';
import path from 'node:path';
import * as fs from 'node:fs';

test('file url test #1', async () => {
  const url = new URL('file:./local/path', 'file://' + path.resolve('.') + '/');
  expect(url.pathname).toEqual(path.resolve('./local/path'));
});

test('file url test #2', async () => {
  const url = new URL('http://a/b/c', 'file://' + path.resolve('.') + '/');
  expect(url.toString()).toEqual('http://a/b/c');
});

test('test local fs read write', async () => {
  const uuid = randomUUID().toString();
  const tmp = path.resolve('tmp');
  const storage = storageByUrl('file://' + path.resolve(tmp, uuid));
  expect(await storage.getFile('some/deep/file.txt')).toBeUndefined();
  await storage.putFile('some/deep/file.txt', Buffer.from('test1'));
  expect((await storage.getFile('some/deep/file.txt'))?.toString()).toEqual('test1');
  await fs.promises.rm(tmp, { recursive: true });
});

test('test local fs list', async () => {
  const uuid = randomUUID().toString();
  const tmp = path.resolve('tmp');
  const storage = storageByUrl('file://' + path.resolve(tmp, uuid));
  await storage.putFile('some/deep1/file_1.txt', Buffer.from('test1'));
  await storage.putFile('some/deep1/file_2.txt', Buffer.from('test1'));
  await storage.putFile('some/deep2/file_1.txt', Buffer.from('test1'));
  const result = await storage.listFiles('some');
  result.sort();
  const expected = ['deep2/file_1.txt', 'deep1/file_1.txt', 'deep1/file_2.txt'];
  expected.sort();
  expect(result).toEqual(expected);
  await storage.deleteFiles('some/deep2/file_1.txt');
  expected.splice(expected.indexOf('some/deep2/file_1.txt'), 1);
  const result1 = await storage.listFiles('some');
  result1.sort();
  expect(result1).toEqual(expected);
  await fs.promises.rm(tmp, { recursive: true });
});

const testS3Address = process.env.TEST_S3_ADDRESS;
if (testS3Address) {
  test('test s3 read write', async () => {
    const uuid = randomUUID().toString();
    const testS3AddressURL = new URL(testS3Address);
    testS3AddressURL.pathname = `${testS3AddressURL.pathname.replace(/\/$/, '')}/${uuid}`;
    const storage = storageByUrl(testS3AddressURL.toString()) as S3Storage;
    expect(await storage.getFile('some/deep/file.txt')).toBeUndefined();
    await storage.putFile('some/deep/file.txt', Buffer.from('test1'));
    expect((await storage.getFile('some/deep/file.txt'))?.toString()).toEqual('test1');
    await storage.deleteFiles(`some/deep/file.txt`);
    expect(await storage.getFile('some/deep/file.txt')).toBeUndefined();
  });

  test('test s3 fs list', async () => {
    const uuid = randomUUID().toString();
    const testS3AddressURL = new URL(testS3Address);
    testS3AddressURL.pathname = `${testS3AddressURL.pathname.replace(/\/$/, '')}/${uuid}`;
    const storage = storageByUrl(testS3AddressURL.toString()) as S3Storage;
    await storage.putFile('some/deep1/file_1.txt', Buffer.from('test1'));
    await storage.putFile('some/deep1/file_2.txt', Buffer.from('test1'));
    await storage.putFile('some/deep2/file_1.txt', Buffer.from('test1'));
    const result = await storage.listFiles('some');
    result.sort();
    const expected = ['deep2/file_1.txt', 'deep1/file_1.txt', 'deep1/file_2.txt'];
    expected.sort();
    expect(result).toEqual(expected);
    await storage.deleteFiles('some/deep2/file_1.txt');
    expected.splice(expected.indexOf('some/deep2/file_1.txt'), 1);
    const result1 = await storage.listFiles('some');
    result1.sort();
    expect(result1).toEqual(expected);
    await storage.client.deleteObjects({
      Bucket: storage.bucket,
      Delete: {
        Objects: [
          { Key: `${storage.root}/some/deep1/file_1.txt` },
          { Key: `${storage.root}/some/deep1/file_2.txt` },
          { Key: `${storage.root}/some/deep2/file_1.txt` }
        ]
      }
    });
  });
}
