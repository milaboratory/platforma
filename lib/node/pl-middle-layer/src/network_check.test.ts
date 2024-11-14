import { test, expect } from '@jest/globals';
import { checkNetwork } from './network_check';

// it's too long, enable only when you need to see the report.
test.skip('should return network connectivity report for a platform endpoint set in PL_ADDRESS env', async () => {
  expect(process.env.PL_ADDRESS).not.toBeUndefined();

  const plEndpoint = process.env.PL_ADDRESS!;
  const report = await checkNetwork(plEndpoint);
  console.log(report);
}, 50000);
