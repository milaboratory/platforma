import { checkNetwork } from './network_check';
import { testCredentials } from './test_utils';

// it's too long, enable only when you need to see the report.
test.skip('should return network connectivity report for a platform endpoint set in PL_ADDRESS env', async () => {
  const { plEndpoint, plUser, plPassword } = testCredentials();

  const report = await checkNetwork(plEndpoint, plUser, plPassword);
  console.log(report);
}, 80000);
