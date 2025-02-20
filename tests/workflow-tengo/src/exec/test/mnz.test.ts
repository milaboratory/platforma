import { tplTest } from '@platforma-sdk/test';

/** The test should:
 * - run monetization with a fake product key
 * - collect lines of the file
 * - returns jwt token
 * - we parse it into monetization and returns the token and a number of remaining runs.
 * - the template prints the token into stdout and returns the number of runs. */
tplTest(
  'should run monetization and return jwt token as env',
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'exec.test.run.monetization_on_hello_world',
      ['token', 'nRemainingRuns'],
      (_) => ({})
    );

    const token = await result
      .computeOutput('token', (out) => out?.getDataAsString())
      .awaitStableValue();

    expect(token.split("\n")).toHaveLength(1);

    // starts with jwt header: { "alg": "RS256" ...}
    expect(token).toMatch(/eyJhbGciOi.*/)

    const nRemainingRuns = await result
      .computeOutput('nRemainingRuns', (n) => n?.getDataAsJson<number>())
      .awaitStableValue();

    expect(nRemainingRuns).toEqual(999992);
  }
);

