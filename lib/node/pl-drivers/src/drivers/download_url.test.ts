import { TestHelpers } from '@milaboratories/pl-client';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';
import * as os from 'node:os';
import { text } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { DownloadUrlDriver } from './download_url';

test('should download a tar archive and extracts its content and then deleted', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test1-'));
    const driver = new DownloadUrlDriver(logger, client.httpDispatcher, dir);

    const url = new URL(
      'https://block.registry.platforma.bio/releases/v1/milaboratory/enter-numbers/0.4.1/frontend.tgz'
    );

    const c = driver.getPath(url);

    const path1 = await c.getValue();
    expect(path1).toBeUndefined();

    await c.awaitChange();

    const path2 = await c.getValue();
    expect(path2).not.toBeUndefined();
    expect(path2?.error).toBeUndefined();
    expect(path2?.path).not.toBeUndefined();

    console.log('frontend saved to dir: ', path2);
    const indexJs = fs.createReadStream(path.join(path2!.path!, 'index.js'));
    const indexJsCode = await text(Readable.toWeb(indexJs));
    expect(indexJsCode).toContain('use strict');

    c.resetState();
  });
});

test('should show a error when 403 status code', async () => {
  try {
    await TestHelpers.withTempRoot(async (client) => {
      const logger = new ConsoleLoggerAdapter();
      const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test1-'));
      const driver = new DownloadUrlDriver(logger, client.httpDispatcher, dir);

      const url = new URL(
        'https://block.registry.platforma.bio/releases/v1/milaboratory/NOT_FOUND'
      );

      const c = driver.getPath(url);

      const path1 = await c.getValue();
      expect(path1).toBeUndefined();

      await c.awaitChange();

      const path2 = await c.getValue();
      expect(path2).not.toBeUndefined();
      expect(path2?.error).not.toBeUndefined();
    });
  } catch (e) {
    console.log('HERE: ', e);
  }
});

test('should abort a downloading process when we reset a state of a computable', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test2-'));
    const driver = new DownloadUrlDriver(logger, client.httpDispatcher, dir);

    const url = new URL(
      'https://block.registry.platforma.bio/releases/v1/milaboratory/enter-numbers/0.4.1/frontend.tgz'
    );

    const c = driver.getPath(url);

    const path1 = await c.getValue();
    expect(path1).toBeUndefined();

    c.resetState();
    await c.awaitChange();

    const path2 = await c.getValue();
    expect(path2).toBeUndefined();
  });
});
