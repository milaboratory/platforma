import { PlClient } from '@milaboratories/pl-client';
import { checkUploadTemplate, runDownloadFile, runUploadFile, runUploadTemplate } from './template';
import { initNetworkCheck } from './network_check';
import { testCredentials } from './tets_utils';
import { test, expect } from 'vitest';
import path from 'path';

test('check runUploadTemplate', async () => {
  const { plEndpoint, plUser, plPassword } = testCredentials();

  const { client, terminate } = await initNetworkCheck(plEndpoint, plUser, plPassword, {
    pingCheckDurationMs: 1000,
    pingTimeoutMs: 1000,
    maxPingsPerSecond: 10,
    httpTimeoutMs: 1000,
    blockRegistryDurationMs: 1000,
  });
  const greeting = await runUploadTemplate(client, 'Jason');

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
  } = await initNetworkCheck(plEndpoint, plUser, plPassword, {
    pingCheckDurationMs: 1000,
    pingTimeoutMs: 1000,
    maxPingsPerSecond: 10,
    httpTimeoutMs: 1000,
    blockRegistryDurationMs: 1000,
  });
  
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
    } = await initNetworkCheck(plEndpoint, plUser, plPassword, {
      pingCheckDurationMs: 1000,
      pingTimeoutMs: 1000,
      maxPingsPerSecond: 10,
      httpTimeoutMs: 1000,
      blockRegistryDurationMs: 1000,
    });
    
    const filePath = path.join(__dirname, '..', '..', 'test_assets', 'answer.txt');
  
    const blob = await runUploadFile(
      logger, lsDriver, uploadBlobClient, client, filePath,
    );

    const content = await runDownloadFile(
      client, downloadClient, blob.id,
    );

    expect(content).toBe('42');

    await terminate();
  });  