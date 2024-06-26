import {
  PlClient,
  PlTransaction,
  ResourceType,
  TestHelpers,
  jsonToData,
  FieldRef,
  FieldId,
  AnyFieldRef,
  ResourceRef,
  stringifyWithResourceId
} from '@milaboratory/pl-client-v2';
import {
  ConsoleLoggerAdapter,
  HmacSha256Signer,
  MiLogger,
  notEmpty
} from '@milaboratory/ts-helpers';
import { scheduler } from 'node:timers/promises';
import { Computable } from '@milaboratory/computable';
import * as os from 'node:os';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { SynchronizedTreeState } from '@milaboratory/pl-tree';
import { DownloadDriver } from './download_and_logs_blob';
import { createDownloadClient, createLogsClient } from '../clients/helpers';
import { LogsStreamDriver } from './logs_stream';
import { LogsDriver } from './logs';

test('should get all logs', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();

    const tree = await SynchronizedTreeState.init(client, client.clientRoot, {
      stopPollingDelay: 10,
      pollingInterval: 10
    });
    const logsStream = new LogsStreamDriver(createLogsClient(client, logger));
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-logs-1-'));
    const download = new DownloadDriver(
      logger,
      createDownloadClient(logger, client),
      createLogsClient(client, logger),
      dir,
      new HmacSha256Signer(HmacSha256Signer.generateSecret()),
      700 * 1024
    );
    const logs = new LogsDriver(logsStream, download);

    const c = Computable.make((ctx) => {
      const stream = ctx
        .accessor(tree.entry())
        .node()
        .traverse('result', 'stream')?.resourceInfo;
      if (stream == undefined) {
        ctx.markUnstable();
        return undefined;
      }
      return logs.getLastLogs(stream, 100, ctx);
    });

    expect(await c.getValue()).toBeUndefined();

    await createRunCommandWithStdoutStream(client, 'bash', [
      '-c',
      'echo 1; sleep 1; echo 2'
    ]);

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
      pollingInterval: 10
    });
    const logsStream = new LogsStreamDriver(createLogsClient(client, logger));
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-logs-2-'));
    const download = new DownloadDriver(
      logger,
      createDownloadClient(logger, client),
      createLogsClient(client, logger),
      dir,
      new HmacSha256Signer(HmacSha256Signer.generateSecret()),
      700 * 1024
    );
    const logs = new LogsDriver(logsStream, download);

    const c = Computable.make((ctx) => {
      const stream = ctx
        .accessor(tree.entry())
        .node()
        .traverse('result', 'stream')?.resourceInfo;
      if (stream == undefined) {
        ctx.markUnstable();
        return undefined;
      }
      return logs.getProgressLog(stream, 'PREFIX', ctx);
    });

    expect(await c.getValue()).toBeUndefined();

    await createRunCommandWithStdoutStream(client, 'bash', [
      '-c',
      'echo PREFIX1; echo PREFIX2; echo 3; sleep 0.1; echo PREFIX4'
    ]);

    while (true) {
      await c.awaitChange();
      const result = await c.getFullValue();

      logger.info(`got result: ${JSON.stringify(result)}`);
      if (result.stable) {
        expect(result.value).toStrictEqual('PREFIX4\n');
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
      pollingInterval: 10
    });
    const logsStream = new LogsStreamDriver(createLogsClient(client, logger));
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-logs-3-'));
    const download = new DownloadDriver(
      logger,
      createDownloadClient(logger, client),
      createLogsClient(client, logger),
      dir,
      new HmacSha256Signer(HmacSha256Signer.generateSecret()),
      700 * 1024
    );
    const logs = new LogsDriver(logsStream, download);

    const c = Computable.make((ctx) => {
      const stream = ctx
        .accessor(tree.entry())
        .node()
        .traverse('result', 'stream')?.resourceInfo;
      if (stream == undefined) {
        ctx.markUnstable();
        return undefined;
      }
      return logs.getLogHandle(stream);
    });

    await createRunCommandWithStdoutStream(client, 'bash', [
      '-c',
      'echo 1; sleep 1; echo 2'
    ]);

    let handle = await c.getValue();

    while (true) {
      await c.awaitChange();
      handle = await c.getValue();
      if (handle != undefined) break;
    }

    while (true) {
      const response = await logs.readText(notEmpty(handle), 100, 0n);
      logger.info(`got response: ${stringifyWithResourceId(response)}`);
      if (response.shouldUpdateHandle) {
        await c.awaitChange();
        handle = await c.getValue();
      }

      if (response.response?.data.toString().length == 4) {
        expect(response.response?.data.toString()).toStrictEqual('1\n2\n');
        return;
      }

      await scheduler.wait(200);
    }
  });
});

async function createRunCommandWithStdoutStream(
  client: PlClient,
  cmd: string,
  args: string[]
): Promise<FieldId> {
  return await client.withWriteTx(
    'CreateRunCommandWithStreaming',
    async (tx: PlTransaction) => {
      const wdFId: FieldRef = createWd(tx);
      const workdirOut: FieldRef = createRunCommand(tx, wdFId, cmd, args);
      const blobsOut: FieldRef = createWdSave(tx, workdirOut);
      const downloadableFId = createDownloadableBlobFromStdout(tx, blobsOut);
      const streamManagerId = createStreamManager(tx, wdFId, downloadableFId);

      const dynamicId: FieldId = {
        resourceId: client.clientRoot,
        fieldName: 'result'
      };
      tx.createField(dynamicId, 'Dynamic', streamManagerId);

      await tx.commit();

      return dynamicId;
    }
  );
}

function createWd(tx: PlTransaction): FieldRef {
  const wd = tx.createEphemeral({ name: 'WorkdirCreate', version: '1' });
  return { resourceId: wd, fieldName: 'workdir' };
}

function createRunCommand(
  tx: PlTransaction,
  wdFId: FieldRef,
  cmd: string,
  args: string[]
): FieldRef {
  const refsId = tx.createStruct({ name: 'RunCommandRefs', version: '1' });
  tx.lock(refsId);
  const cmdData = {
    type: 'string',
    value: cmd
  };
  const argsData = args.map((arg) => {
    return {
      type: 'string',
      value: arg
    };
  });
  const optsData = {
    queueName: 'heavy',
    errorLines: 200,
    redirectStdout: 'logs.txt',
    redirectStderr: 'logs.txt',
    envs: []
  };

  const runCmdId = tx.createEphemeral({ name: 'RunCommand', version: '1' });

  const setInputValue = (fName: string, rType: ResourceType, data: unknown) => {
    const valResId = tx.createValue(rType, jsonToData(data));
    tx.setField({ resourceId: runCmdId, fieldName: fName }, valResId);
  };

  tx.setField({ resourceId: runCmdId, fieldName: 'workdirIn' }, wdFId);
  tx.setField({ resourceId: runCmdId, fieldName: 'refs' }, refsId);
  setInputValue('cmd', { name: 'RunCommandCmd', version: '1' }, cmdData);
  setInputValue('args', { name: 'RunCommandArgs', version: '1' }, argsData);
  setInputValue(
    'options',
    { name: 'run-command/options', version: '1' },
    optsData
  );

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
        filePath: 'logs.txt'
      }
    ])
  );
  tx.setField({ resourceId: wdSave, fieldName: 'workdirIn' }, workdirOut);
  tx.setField({ resourceId: wdSave, fieldName: 'rules' }, wdSaveRules);

  return { resourceId: wdSave, fieldName: 'blobsOut' };
}

function createDownloadableBlobFromStdout(
  tx: PlTransaction,
  blobsOut: FieldRef
): FieldRef {
  const blobOut = tx.getFutureFieldValue(blobsOut, 'logs.txt', 'Input');
  const blobDownloadId = tx.createStruct({
    name: 'BlobDownload',
    version: '2'
  });
  tx.setField({ resourceId: blobDownloadId, fieldName: 'blob' }, blobOut);

  return { resourceId: blobDownloadId, fieldName: 'downloadable' };
}

function createStreamManager(
  tx: PlTransaction,
  wdFId: FieldRef,
  downloadableFId: AnyFieldRef
): ResourceRef {
  const streamId = tx.createEphemeral({ name: 'CreateStream', version: '2' });
  tx.setField({ resourceId: streamId, fieldName: 'workdir' }, wdFId);
  const filePathId = tx.createValue(
    { name: 'json/string', version: '1' },
    jsonToData('logs.txt')
  );
  tx.setField({ resourceId: streamId, fieldName: 'filePath' }, filePathId);
  const streamFId = { resourceId: streamId, fieldName: 'stream' };

  const streamManagerId = tx.createEphemeral({
    name: 'StreamManager',
    version: '2'
  });
  tx.setField(
    { resourceId: streamManagerId, fieldName: 'downloadable' },
    downloadableFId
  );
  tx.setField({ resourceId: streamManagerId, fieldName: 'stream' }, streamFId);

  return streamManagerId;
}
