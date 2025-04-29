export function testCredentials() {
  expect(process.env.PL_ADDRESS).not.toBeUndefined();

  return {
    plEndpoint: process.env.PL_ADDRESS!,
    plUser: process.env.PL_TEST_USER, // maybe undefined
    plPassword: process.env.PL_TEST_PASSWORD, // maybe undefined
  };
}
