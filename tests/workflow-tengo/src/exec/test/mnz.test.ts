import { tplTest } from '@platforma-sdk/test';

/** The test should:
 * - run monetization with a fake product key
 * - collect lines of the file
 * - returns jwt token */
tplTest(
  'should run monetization and return jwt token as env',
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'exec.test.run.monetization_on_hello_world',
      ['token'],
      (_) => ({})
    );

    const token = await result
      .computeOutput('token', (out) => out?.getDataAsString())
      .awaitStableValue();

    expect(token.split("\n")).toHaveLength(1);

    // starts with jwt header: { "alg": "RS256" ...}
    expect(token).toMatch(/eyJhbGciOi.*/)
  }
);


tplTest(
  'should run dry-run monetization and return info with remaining runs',
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'exec.test.run.monetization_dry_run',
      ['info'],
      (_) => ({})
    );

    const info = await result
      .computeOutput('info', (out) => out?.getDataAsJson<unknown>())
      .awaitStableValue();

    // faked response from mnz-client
    expect(info).toMatchObject({
      spentRuns: 192,
      runsToSpend: 1,
      willRemainAfterRun: 7,
      subscription: {
        availableRuns: 200,
        startsAt: "2025-02-25T11:50:59.000Z",
        expiresAt: "2025-03-27T11:50:59.000Z"
      }
    });
  }
);

