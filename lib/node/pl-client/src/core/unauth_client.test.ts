import { UnauthenticatedPlClient } from './unauth_client';
import { getTestConfig, plAddressToTestConfig } from '../test/test_config';
import { UnauthenticatedError } from './errors';
import { test, expect } from 'vitest';

test('ping test', async () => {
  const client = await UnauthenticatedPlClient.build(plAddressToTestConfig(getTestConfig().address));
  const response = await client.ping();
  expect(response).toHaveProperty('coreVersion');
});

test('get auth methods', async () => {
  const client = await UnauthenticatedPlClient.build(plAddressToTestConfig(getTestConfig().address));
  const response = await client.authMethods();
  expect(response).toHaveProperty('methods');
});

test('wrong login', async () => {
  const testConfig = getTestConfig();
  if (testConfig.test_user === undefined || testConfig.test_password === undefined) {
    console.log('skipped');
    return;
  }
  const client = await UnauthenticatedPlClient.build(plAddressToTestConfig(testConfig.address));
  await expect(client.login(testConfig.test_user, testConfig.test_password + 'A')).rejects.toThrow(
    UnauthenticatedError
  );
});
