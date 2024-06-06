import { PlClient, PlTransaction, ResourceType, TestHelpers, jsonToData, FieldRef, FieldId, AnyFieldRef, ResourceRef, stringifyWithResourceId } from '@milaboratory/pl-client-v2';
import { ConsoleLoggerAdapter, MiLogger } from '@milaboratory/ts-helpers';
import { Computable, computable } from '@milaboratory/computable';
import { createDownloadDriver, createLogsDriver } from './helpers';
import * as os from 'node:os';
import { SynchronizedTreeState } from '@milaboratory/pl-tree';
import { ResourceInfo } from '../clients/helpers';
import { scheduler } from 'node:timers/promises';
import { Log, LogId, LogsDriver } from './logs_stream';
import { DownloadDriver } from './download_and_logs_blob';

const callerId = 'callerId';

test('should get all logs', async () => {
  await TestHelpers.withTempRoot(async client => {
    const logger = new ConsoleLoggerAdapter();

    const tree = new SynchronizedTreeState(client, client.clientRoot, { stopPollingDelay: 10, pollingInterval: 10 });
    const logs = createLogsDriver(client, logger);
    const download = createDownloadDriver(client, logger, os.tmpdir(), 700 * 1024);

    const c = computable(
      tree.accessor(), { mode: 'StableOnlyRetentive' },
      tree => {
        const stream = tree.traverse({}, 'result', 'stream')?.value;
        if (stream == undefined)
          return undefined;

        const rInfo: ResourceInfo = {
          id: stream.id,
          type: stream.resourceType,
        }

        if (stream.resourceType.name.startsWith('StreamWorkdir'))
          return computable(
            logs, {},
            driver => ({ done: false, ...driver.getLastLogs(rInfo, 100, callerId) }),
          )
        else
          return computable(
            download, {},
            driver => ({ done: true, ...driver.getLastLogs(rInfo, 100, callerId) }),
          )
      }
    );

    expect(await c.getValue()).toBeUndefined();

    await createRunCommandWithStdoutStream(client, "bash", ["-c", "echo 1; sleep 0.1; echo 2"]);

    while (true) {
      await c.listen();

      const result = await c.getValue();

      logger.info(`got result: ${JSON.stringify(result)}`);
      if (result?.done) {
        expect(result.error).toBeUndefined();
        expect(result.log).toStrictEqual("1\n2\n")
        return;
      }
    }
  })
})

test('should get last line with a prefix', async () => {
  await TestHelpers.withTempRoot(async client => {
    const logger = new ConsoleLoggerAdapter();

    const tree = new SynchronizedTreeState(client, client.clientRoot, { stopPollingDelay: 10, pollingInterval: 10 });
    const logs = createLogsDriver(client, logger);
    const download = createDownloadDriver(client, logger, os.tmpdir(), 700 * 1024);

    const c = computable(
      tree.accessor(), { mode: 'StableOnlyRetentive' },
      tree => {
        const stream = tree.traverse({}, 'result', 'stream')?.value;
        if (stream == undefined)
          return undefined;

        const rInfo: ResourceInfo = {
          id: stream.id,
          type: stream.resourceType,
        }

        if (stream.resourceType.name.startsWith('StreamWorkdir'))
          return computable(
            logs, {},
            driver => ({done: false, ...driver.getProgressLog(rInfo, "PREFIX", callerId) }),
          )
        else
          return computable(
            download, {},
            driver => ({done: true, ...driver.getProgressLog(rInfo, "PREFIX", callerId) }),
          )
      }
    );

    expect(await c.getValue()).toBeUndefined();

    await createRunCommandWithStdoutStream(
      client,
      "bash",
      ["-c", "echo PREFIX1; echo PREFIX2; echo 3; sleep 0.1; echo PREFIX4"],
    );

    while (true) {
      await c.listen();

      const result = await c.getValue();
      logger.info(`got result: ${JSON.stringify(result)}`);
      if (result?.done) {
        expect(result.error).toBeUndefined();
        expect(result.log).toStrictEqual("PREFIX4\n")
        return;
      }
    }
  })
})

test('should get log smart object and get log lines from that', async () => {
  await TestHelpers.withTempRoot(async client => {
    const logger = new ConsoleLoggerAdapter();

    const tree = new SynchronizedTreeState(client, client.clientRoot, { stopPollingDelay: 10, pollingInterval: 10 });
    const logs = createLogsDriver(client, logger);
    const download = createDownloadDriver(client, logger, os.tmpdir(), 700 * 1024);

    const c = computable(
      tree.accessor(), { mode: 'StableOnlyRetentive' },
      tree => {
        const stream = tree.traverse({}, 'result', 'stream')?.value;
        if (stream == undefined)
          return undefined;

        const rInfo: ResourceInfo = {
          id: stream.id,
          type: stream.resourceType,
        }

        if (stream.resourceType.name.startsWith('StreamWorkdir'))
          return computable(
            logs, {},
            driver => ({ logId: driver.getLogId(rInfo, callerId), source: 'logs' }),
          )
        else
          return computable(
            download, {},
            driver => ({ logId: driver.getLogId(rInfo, callerId), source: 'download' }),
          )
      }
    );

    // TODO: callerId (maybe in accessor?)

    await createRunCommandWithStdoutStream(
      client,
      "bash",
      ["-c", "echo 1; sleep 1; echo 2"],
    );

    let smartObject = await getSmartObject(logger, logs, download, c);

    while (true) {
      try {
        const logs = await smartObject.readText(10, 0n)
        logger.info(`got size of the result: ${logs?.size}`);
        if (logs?.data.toString().length == 4) {
          expect(logs.data.toString()).toStrictEqual("1\n2\n")
          return;
        }
      } catch (e) {
        smartObject = await getSmartObject(logger, logs, download, c);
      }

      await scheduler.wait(200);
    }
  })
})

interface LogIdAndSource {
  logId: LogId | undefined;
  source: string;
}

async function getSmartObject(
  logger: MiLogger,
  logs: LogsDriver,
  download: DownloadDriver,
  c: Computable<LogIdAndSource | undefined>,
) {
  while (true) {
    await c.listen();

    const result = await c.getValue();
    logger.info(`got result: ${stringifyWithResourceId(result)}`);
    if (result != undefined && result.logId != undefined) {
      if (result.source == 'logs')
        return logs.getLog(result.logId);
      else
        return download.getLog(result.logId);
    }
  }
}

async function createRunCommandWithStdoutStream(
  client: PlClient,
  cmd: string,
  args: string[],
): Promise<FieldId> {
  return await client.withWriteTx(
    'CreateRunCommandWithStreaming',
    async (tx: PlTransaction) => {
      const wdFId: FieldRef = createWd(tx);
      const workdirOut: FieldRef = createRunCommand(tx, wdFId, cmd, args);
      const blobsOut: FieldRef = createWdSave(tx, workdirOut);
      const downloadableFId = createDownloadableBlobFromStdout(tx, blobsOut);
      const streamManagerId = createStreamManager(tx, wdFId, downloadableFId);

      const dynamicId: FieldId = { resourceId: client.clientRoot, fieldName: 'result' };
      tx.createField(dynamicId, 'Dynamic', streamManagerId);

      await tx.commit();

      return dynamicId;
    })
}

function createWd(tx: PlTransaction): FieldRef {
  const wd = tx.createEphemeral({ name: "WorkdirCreate", version: "1" });
  return { resourceId: wd, fieldName: "workdir" };
}

function createRunCommand(tx: PlTransaction, wdFId: FieldRef, cmd: string, args: string[]): FieldRef {
  const refsId = tx.createStruct({ name: "RunCommandRefs", version: "1" });
  tx.lock(refsId);
  const cmdData = {
    type: "string",
    value: cmd
  };
  const argsData = args.map(arg => {
    return {
      type: "string",
      value: arg,
    };
  });
  const optsData = {
    queueName: "heavy",
    errorLines: 200,
    redirectStdout: "logs.txt",
    redirectStderr: "logs.txt",
    envs: [],
  };

  const runCmdId = tx.createEphemeral({ name: "RunCommand", version: "1" });

  const setInputValue = (fName: string, rType: ResourceType, data: unknown) => {
    const valResId = tx.createValue(rType, jsonToData(data));
    tx.setField({ resourceId: runCmdId, fieldName: fName }, valResId);
  };

  tx.setField({ resourceId: runCmdId, fieldName: "workdirIn" }, wdFId);
  tx.setField({ resourceId: runCmdId, fieldName: "refs" }, refsId);
  setInputValue("cmd", { name: "RunCommandCmd", version: "1" }, cmdData);
  setInputValue("args", { name: "RunCommandArgs", version: "1" }, argsData);
  setInputValue("options", { name: "run-command/options", version: "1" }, optsData);

  return { resourceId: runCmdId, fieldName: "workdirOut" };
}

function createWdSave(tx: PlTransaction, workdirOut: FieldRef): FieldRef {
  const wdSave = tx.createEphemeral({ name: "WorkdirSave", version: "1" });
  const wdSaveRules = tx.createValue({ name: "WorkdirSave/rules", version: "1" }, jsonToData([{
    blobKey: "logs.txt",
    type: "file",
    filePath: "logs.txt",
  }]));
  tx.setField({ resourceId: wdSave, fieldName: "workdirIn" }, workdirOut);
  tx.setField({ resourceId: wdSave, fieldName: "rules" }, wdSaveRules);

  return { resourceId: wdSave, fieldName: "blobsOut" };
}

function createDownloadableBlobFromStdout(tx: PlTransaction, blobsOut: FieldRef): FieldRef {
  const blobOut = tx.getFutureFieldValue(blobsOut, "logs.txt", 'Input');
  const blobDownloadId = tx.createStruct({ name: "BlobDownload", version: "2" });
  tx.setField({ resourceId: blobDownloadId, fieldName: "blob" }, blobOut);

  return { resourceId: blobDownloadId, fieldName: "downloadable" };
}

function createStreamManager(tx: PlTransaction, wdFId: FieldRef, downloadableFId: AnyFieldRef): ResourceRef {
  const streamId = tx.createEphemeral({ name: "CreateStream", version: "2" });
  tx.setField({ resourceId: streamId, fieldName: "workdir" }, wdFId);
  const filePathId = tx.createValue({ name: "json/string", version: "1" }, jsonToData("logs.txt"));
  tx.setField({ resourceId: streamId, fieldName: "filePath" }, filePathId);
  const streamFId = { resourceId: streamId, fieldName: "stream" };

  const streamManagerId = tx.createEphemeral({ name: "StreamManager", version: "2" });
  tx.setField({ resourceId: streamManagerId, fieldName: "downloadable" }, downloadableFId);
  tx.setField({ resourceId: streamManagerId, fieldName: "stream" }, streamFId);

  return streamManagerId;
}

