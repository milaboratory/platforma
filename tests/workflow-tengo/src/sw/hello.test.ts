import { Pl } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';

tplTest('test1', async ({ helper, expect }) => {
  const result = await helper.renderTemplate(false, 'sw.hello', ['main'], (tx) => ({
    text: tx.createValue(Pl.JsonObject, JSON.stringify('asdasd'))
  }));
  const mainResult = result.computeOutput('main', (a) => a?.getDataAsString());

  const output = await awaitStableState(mainResult, 10000);
  expect(output).toBeDefined();

  console.log(output);

  const lines = output!.split('\n');

  expect(lines).length(7, `original output:\n${output}`);
  expect(lines[0].trim()).toBe('cmd = "java"');
  expect(lines[1].trim()).toBe('arg[0] = "got fake java by dependency"');
  if (!lines[2].trim().startsWith('arg[1] = "pkg=/'))
    throw new Error(`line[2] not starts with pkg=/`);
  if (!lines[3].trim().startsWith('arg[2] = "java=/'))
    throw new Error(`line[3] not starts with java=/`);
  expect(lines[4].trim()).toBe(`arg[3] = "${customTestText}"`);
});
