import { checkNetwork } from './network_check';
import { testCredentials } from './test_utils';

// it's too long, enable only when you need to see the report.
// Cases to test:
// - PL_ADDRESS is to an invalid address
// - PL_ADDRESS is to a valid address, but the user or the password are wrong
// - locally
// - stop minio and retest locally
// - on demo server
test('should return network connectivity report for a platform endpoint set in PL_ADDRESS env', async () => {
  const { plEndpoint, plUser, plPassword } = testCredentials();

  const report = await checkNetwork(plEndpoint, plUser, plPassword);
  console.log(report);
}, 80000);
