import { createBigTempFile, downloadFromEveryStorage, runDownloadFile, runPythonSoftware, runSoftware, runUploadFile, runUploadTemplate } from './template';
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
    signer,
    terminate,
  } = await initNetworkCheck(plEndpoint, plUser, plPassword);

  const { filePath } = await createBigTempFile();

  const blob = await runUploadFile(
    logger,
    signer,
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

test('check downloadFromEveryStorage', async () => {
  const { plEndpoint, plUser, plPassword } = testCredentials();
  const { logger, client, lsDriver, terminate } = await initNetworkCheck(plEndpoint, plUser, plPassword);

  const storages = await downloadFromEveryStorage(logger, client, lsDriver, {
    minLsRequests: 10,
    bytesLimit: 1024,
    minFileSize: 1024,
    maxFileSize: 50 * 1024 * 1024,
    nFilesToCheck: 1,
  });

  expect(storages).toBeDefined();
  expect(Object.keys(storages).length).toBeGreaterThan(0);
  expect(Object.entries(storages).every(([_, report]) => report.status)).toBe(true);

  console.log(JSON.stringify(storages, null, 2));

  await terminate();
});
