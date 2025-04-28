import { runDownloadFile, runPythonSoftware, runSoftware, runUploadFile, runUploadTemplate } from './template';
import { initNetworkCheck } from './network_check';
import { testCredentials } from './test_utils';
import { test, expect } from 'vitest';
import path from 'path';

test('check runUploadTemplate', async () => {
  const { plEndpoint, plUser, plPassword } = testCredentials();
  const { logger, client, terminate } = await initNetworkCheck(plEndpoint, plUser, plPassword);

  const greeting = await runUploadTemplate(logger, client, 'Jason');

  expect(greeting).toBe('Hello, Jason');

  await terminate();
});

test('check runUploadFile', async () => {
  const { plEndpoint, plUser, plPassword } = testCredentials();
  const {
    logger,
    lsDriver,
    uploadBlobClient,
    client,
    terminate,
  } = await initNetworkCheck(plEndpoint, plUser, plPassword);

  const filePath = path.join(__dirname, '..', '..', 'test_assets', 'answer.txt');

  const blob = await runUploadFile(
    logger,
    lsDriver,
    uploadBlobClient,
    client,
    filePath,
  );

  expect(blob.type.name).toBe('Blob');

  await terminate();
});

test('check runDownloadFile', async () => {
  const { plEndpoint, plUser, plPassword } = testCredentials();
  const {
    logger,
    lsDriver,
    uploadBlobClient,
    downloadClient,
    client,
    terminate,
  } = await initNetworkCheck(plEndpoint, plUser, plPassword);

  const filePath = path.join(__dirname, '..', '..', 'test_assets', 'answer.txt');

  const content = await runDownloadFile(logger, client, lsDriver, uploadBlobClient, downloadClient, filePath);

  expect(content).toBe('42');

  await terminate();
});

test('check runSoftware', async () => {
  const { plEndpoint, plUser, plPassword } = testCredentials();
  const { client, terminate } = await initNetworkCheck(plEndpoint, plUser, plPassword);

  const greeting = await runSoftware(client);

  expect(greeting).toBe('Hello from go binary\n');

  await terminate();
});

test('check runPythonSoftware', async () => {
  const { plEndpoint, plUser, plPassword } = testCredentials();
  const { client, terminate } = await initNetworkCheck(plEndpoint, plUser, plPassword);

  const greeting = await runPythonSoftware(client, 'John');

  expect(greeting).toBe('Hello, John!\n');

  await terminate();
});
