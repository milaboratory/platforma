import { expect, test } from 'vitest';
import { Computable } from '@milaboratories/computable';
import type {
  AnyFieldRef,
  FieldId,
  FieldRef,
  PlClient,
  PlTransaction,
  ResourceId,
  ResourceRef,
  ResourceType } from '@milaboratories/pl-client';
import {
  TestHelpers,
  jsonToData,
  stringifyWithResourceId,
} from '@milaboratories/pl-client';
import { SynchronizedTreeState } from '@milaboratories/pl-tree';
import { ConsoleLoggerAdapter, HmacSha256Signer, notEmpty } from '@milaboratories/ts-helpers';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { scheduler } from 'node:timers/promises';
import { createDownloadClient, createLogsClient } from '../clients/constructors';
import { DownloadDriver } from './download_blob/download_blob';
import { LogsDriver } from './logs';
import { LogsStreamDriver } from './logs_stream';

test('should get all logs', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();

    const tree = await SynchronizedTreeState.init(client, client.clientRoot, {
      stopPollingDelay: 10,
      pollingInterval: 10,
    });
    const logsStream = new LogsStreamDriver(logger, createLogsClient(client, logger));
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-logs-1-'));
    const rangesCacheDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-logs-ranges'));
    const download = await DownloadDriver.init(
      logger,
      createDownloadClient(logger, client, []),
      createLogsClient(client, logger),
      dir,
      rangesCacheDir,
      new HmacSha256Signer(HmacSha256Signer.generateSecret()),
      { cacheSoftSizeBytes: 700 * 1024, nConcurrentDownloads: 10, rangesCacheMaxSizeBytes: 1024 },
    );
    const logs = new LogsDriver(logger, logsStream, download);

    await createRunCommandWithStdoutStream(client, 'bash', ['-c', 'echo 1; sleep 1; echo 2']);

    const c = Computable.make((ctx) => {
      const streamManager = ctx.accessor(tree.entry()).node().traverse('result')?.persist();
      if (streamManager === undefined) {
        ctx.markUnstable('no stream manager');
        return;
      }

      return logs.getLastLogs(streamManager, 100, ctx);
    });

    while (true) {
      await c.awaitChange();
      const result = await c.getFullValue();

      logger.info(`got result: ${JSON.stringify(result)}`);
      if (result.stable) {
        expect(result.value).toStrictEqual('1\n2\n');
        return;
      }
    }
  });
});

test('should get last line with a prefix', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();

    const tree = await SynchronizedTreeState.init(client, client.clientRoot, {
      stopPollingDelay: 10,
      pollingInterval: 10,
    });
    const logsStream = new LogsStreamDriver(logger, createLogsClient(client, logger));
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-logs-2-'));
    const rangesCacheDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-logs-ranges'));
    const download = await DownloadDriver.init(
      logger,
      createDownloadClient(logger, client, []),
      createLogsClient(client, logger),
      dir,
      rangesCacheDir,
      new HmacSha256Signer(HmacSha256Signer.generateSecret()),
      { cacheSoftSizeBytes: 700 * 1024, nConcurrentDownloads: 10, rangesCacheMaxSizeBytes: 1024 },
    );
    const logs = new LogsDriver(logger, logsStream, download);

    const c = Computable.make((ctx) => {
      const streamManager = ctx.accessor(tree.entry()).node().traverse('result')?.persist();
      if (streamManager === undefined) {
        ctx.markUnstable('no stream manager');
        return;
      }

      return logs.getProgressLogWithInfo(streamManager, 'PREFIX', ctx);
    });

    expect(await c.getValue()).toBeUndefined();

    await createRunCommandWithStdoutStream(client, 'bash', [
      '-c',
      'echo PREFIX1; echo PREFIX2; echo 3; sleep 0.1; echo PREFIX4',
    ]);

    while (true) {
      await c.awaitChange();
      const result = await c.getFullValue();

      logger.info(`got result: ${JSON.stringify(result)}`);
      if (result.stable) {
        expect(result.value).toMatchObject({
          progressLine: 'PREFIX4\n',
          live: false,
        });
        return;
      }
    }
  });
});

test('should get log smart object and get log lines from that', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();

    const tree = await SynchronizedTreeState.init(client, client.clientRoot, {
      stopPollingDelay: 10,
      pollingInterval: 10,
    });
    const logsStream = new LogsStreamDriver(logger, createLogsClient(client, logger));
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-logs-3-'));
    const rangesCacheDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-logs-ranges'));
    const download = await DownloadDriver.init(
      logger,
      createDownloadClient(logger, client, []),
      createLogsClient(client, logger),
      dir,
      rangesCacheDir,
      new HmacSha256Signer(HmacSha256Signer.generateSecret()),
      { cacheSoftSizeBytes: 700 * 1024, nConcurrentDownloads: 10, rangesCacheMaxSizeBytes: 1024 },
    );
    const logs = new LogsDriver(logger, logsStream, download);

    const c = Computable.make((ctx) => {
      const streamManager = ctx.accessor(tree.entry()).node().traverse('result')?.persist();
      if (streamManager === undefined) {
        ctx.markUnstable('no stream manager');
        return;
      }

      return logs.getLogHandle(streamManager, ctx);
    });

    await createRunCommandWithStdoutStream(client, 'bash', ['-c', 'echo 1; sleep 1; echo 2']);

    let handle = await c.getValue();

    while (true) {
      await c.awaitChange();
      handle = await c.getValue();
      if (handle != undefined) break;
    }

    while (true) {
      const response = await logs.readText(notEmpty(handle), 100);
      logger.info(`got response: ${stringifyWithResourceId(response)}`);
      if (response.shouldUpdateHandle) {
        await c.awaitChange();
        handle = await c.getValue();
        continue;
      }

      if (response.data.toString().length == 4) {
        expect(response.data.toString()).toStrictEqual('1\n2\n');
        return;
      }

      await scheduler.wait(200);
    }
  });
});

async function createRunCommandWithStdoutStream(
  client: PlClient,
  cmd: string,
  args: string[],
): Promise<ResourceId> {
  return await client.withWriteTx('CreateRunCommandWithStreaming', async (tx: PlTransaction) => {
    const wdFId: FieldRef = createWd(tx);
    const workdirOut: FieldRef = createRunCommand(tx, wdFId, cmd, args);
    const blobsOut: FieldRef = createWdSave(tx, workdirOut);
    const downloadableFId = createDownloadableBlobFromStdout(tx, blobsOut);
    const streamManagerId = createStreamManager(tx, wdFId, downloadableFId);

    const dynamicId: FieldId = {
      resourceId: client.clientRoot,
      fieldName: 'result',
    };
    tx.createField(dynamicId, 'Dynamic', streamManagerId);

    await tx.commit();

    return await streamManagerId.globalId;
  });
}

function createWd(tx: PlTransaction): FieldRef {
  const wd = tx.createEphemeral({ name: 'WorkdirCreate', version: '1' });
  return { resourceId: wd, fieldName: 'workdir' };
}

function createRunCommand(
  tx: PlTransaction,
  wdFId: FieldRef,
  cmd: string,
  args: string[],
): FieldRef {
  const refsId = tx.createStruct({ name: 'RunCommandRefs', version: '1' });
  tx.lock(refsId);
  const cmdData = {
    type: 'string',
    value: cmd,
  };
  const argsData = args.map((arg) => {
    return {
      type: 'string',
      value: arg,
    };
  });
  const optsData = {
    queueName: 'heavy',
    errorLines: 200,
    redirectStdout: 'logs.txt',
    redirectStderr: 'logs.txt',
    envs: [],
  };

  const runCmdId = tx.createEphemeral({ name: 'RunCommand/executor', version: '1' });

  const setInputValue = (fName: string, rType: ResourceType, data: unknown) => {
    const valResId = tx.createValue(rType, jsonToData(data));
    tx.setField({ resourceId: runCmdId, fieldName: fName }, valResId);
  };

  tx.setField({ resourceId: runCmdId, fieldName: 'workdirIn' }, wdFId);
  tx.setField({ resourceId: runCmdId, fieldName: 'refs' }, refsId);
  setInputValue('cmd', { name: 'RunCommandCmd', version: '1' }, cmdData);
  setInputValue('args', { name: 'RunCommandArgs', version: '1' }, argsData);
  setInputValue('options', { name: 'run-command/options', version: '1' }, optsData);

  return { resourceId: runCmdId, fieldName: 'workdirOut' };
}

function createWdSave(tx: PlTransaction, workdirOut: FieldRef): FieldRef {
  const wdSave = tx.createEphemeral({ name: 'WorkdirSave', version: '1' });
  const wdSaveRules = tx.createValue(
    { name: 'WorkdirSave/rules', version: '1' },
    jsonToData([
      {
        blobKey: 'logs.txt',
        type: 'file',
        filePath: 'logs.txt',
      },
    ]),
  );
  tx.setField({ resourceId: wdSave, fieldName: 'workdirIn' }, workdirOut);
  tx.setField({ resourceId: wdSave, fieldName: 'rules' }, wdSaveRules);

  return { resourceId: wdSave, fieldName: 'blobsOut' };
}

function createDownloadableBlobFromStdout(tx: PlTransaction, blobsOut: FieldRef): FieldRef {
  const blobOut = tx.getFutureFieldValue(blobsOut, 'logs.txt', 'Input');
  const blobDownloadId = tx.createStruct({
    name: 'BlobDownload',
    version: '2',
  });
  tx.setField({ resourceId: blobDownloadId, fieldName: 'blob' }, blobOut);

  return { resourceId: blobDownloadId, fieldName: 'downloadable' };
}

function createStreamManager(
  tx: PlTransaction,
  wdFId: FieldRef,
  downloadableFId: AnyFieldRef,
): ResourceRef {
  const streamId = tx.createEphemeral({ name: 'CreateStream', version: '2' });
  tx.setField({ resourceId: streamId, fieldName: 'workdir' }, wdFId);
  const filePathId = tx.createValue({ name: 'json/string', version: '1' }, jsonToData('logs.txt'));
  tx.setField({ resourceId: streamId, fieldName: 'filePath' }, filePathId);
  const streamFId = { resourceId: streamId, fieldName: 'stream' };

  const streamManagerId = tx.createEphemeral({
    name: 'StreamManager',
    version: '2',
  });
  tx.setField({ resourceId: streamManagerId, fieldName: 'downloadable' }, downloadableFId);
  tx.setField({ resourceId: streamManagerId, fieldName: 'stream' }, streamFId);

  return streamManagerId;
}
