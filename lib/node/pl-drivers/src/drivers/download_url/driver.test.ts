import { TestHelpers } from '@milaboratories/pl-client';
import { ConsoleLoggerAdapter, HmacSha256Signer } from '@milaboratories/ts-helpers';
import * as os from 'node:os';
import { text } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { DownloadUrlDriver } from './driver';
import { test, expect } from 'vitest';

test('should download a tar archive and extracts its content and then deleted', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test1-'));
    const driver = new DownloadUrlDriver(logger, client.httpDispatcher, dir, genSigner());

    const url = new URL(
      'https://block.registry.platforma.bio/releases/v1/milaboratory/enter-numbers/0.4.1/frontend.tgz',
    );

    const c = driver.getUrl(url);

    const url1 = await c.getValue();
    expect(url1).toBeUndefined();

    await c.awaitChange();

    const url2 = await c.getValue();
    expect(url2).not.toBeUndefined();
    expect(url2?.error).toBeUndefined();
    expect(url2?.url).not.toBeUndefined();

    console.log('frontend saved to dir by url: ', url2);
    const u = new URL(url2!.url!);
    u.pathname = 'index.js';
    const ui = driver.getPathForBlockUI(u.toString());
    const indexJs = fs.createReadStream(ui);
    const indexJsCode = await text(Readable.toWeb(indexJs));
    expect(indexJsCode).toContain('use strict');

    c.resetState();
  });
}, 45000);

test('should show a error when 404 status code', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test1-'));
    
    console.log('creating download url driver')
    const driver = new DownloadUrlDriver(logger, client.httpDispatcher, dir, genSigner());

    const url = new URL(
      'https://block.registry.platforma.bio/releases/v1/milaboratory/NOT_FOUND',
    );

    console.log('getting url1 from driver')
    const c = driver.getUrl(url);

    console.log('getting url1 value')
    const url1 = await c.getValue();
    expect(url1).toBeUndefined();

    console.log('waiting for driver URL to change')
    await c.awaitChange();

    console.log('getting url2 value')
    const url2 = await c.getValue();
    console.log('url2 value', url2);
    expect(url2).not.toBeUndefined();
    expect(url2?.error).not.toBeUndefined();
    expect(url2?.url).toBeUndefined();
    console.log('test done')
  });
}, 60000);

test('should abort a downloading process when we reset a state of a computable', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test2-'));
    const driver = new DownloadUrlDriver(logger, client.httpDispatcher, dir, genSigner());

    const url = new URL(
      'https://block.registry.platforma.bio/releases/v1/milaboratory/enter-numbers/0.4.1/frontend.tgz',
    );

    const c = driver.getUrl(url);

    const url1 = await c.getValue();
    expect(url1).toBeUndefined();

    c.resetState();
    await c.awaitChange();

    const url2 = await c.getValue();
    expect(url2).toBeUndefined();
  });
});

function genSigner() {
  return new HmacSha256Signer(HmacSha256Signer.generateSecret())
}
