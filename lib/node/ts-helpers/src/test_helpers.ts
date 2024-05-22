export const ALLOW_INTEGRATION = process.env.ALLOW_INTEGRATION
    ? Boolean(process.env.ALLOW_INTEGRATION)
  : false;

export const testIntegration = ALLOW_INTEGRATION ? test : test.skip;
