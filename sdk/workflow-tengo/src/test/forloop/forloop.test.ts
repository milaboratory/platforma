import { tplTest } from '@milaboratory/sdk-test';

tplTest(
  'for loop simple test',
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      true,
      'test.forloop.forloop',
      ['concat', 'concatReversed'],
      (tx) => ({})
    );
    const concat = result.computeOutput('concat', (a, ctx) => {
      const fields = ["c1", "c2", "c3"];
      const results = fields.map(fName => a?.getField(fName)?.value?.getDataAsJson<string>());

      if (results.includes(undefined))
        ctx.markUnstable();

      return results;
    });

    const concatReversed = result.computeOutput('concatReversed', (a, ctx) => {
      const fields = ["c1", "c2", "c3"];
      const results = fields.map(fName => a?.getField(fName)?.value?.getDataAsJson<string>());

      if (results.includes(undefined))
        ctx.markUnstable();

      return results;
    });

    expect(await concat.awaitStableValue()).toEqual([
      "astring_bstring_c11",
      "astring_bstring_c22",
      "astring_bstring_c33",
    ]);

    expect(await concatReversed.awaitStableValue()).toEqual([
      "c11_bstring_astring",
      "c22_bstring_astring",
      "c33_bstring_astring",
    ]);
  }
);
