export function testCredentials() {
  expect(process.env.PL_ADDRESS).not.toBeUndefined();
  expect(process.env.PL_TEST_USER).not.toBeUndefined();
  expect(process.env.PL_TEST_PASSWORD).not.toBeUndefined();

  return {
    plEndpoint: process.env.PL_ADDRESS!,
    plUser: process.env.PL_TEST_USER!,
    plPassword: process.env.PL_TEST_PASSWORD!,
  };
}
