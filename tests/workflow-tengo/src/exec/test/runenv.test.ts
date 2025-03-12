import { Pl } from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';

tplTest('run-fake-java', async ({ helper, expect }) => {
  const customTestText = 'hello from fake java';

  const result = await helper.renderTemplate(false, 'exec.test.run.fake_java', ['main'], (tx) => ({
    text: tx.createValue(Pl.JsonObject, JSON.stringify(customTestText)),
  }));
  const mainResult = result.computeOutput('main', (a) => a?.getDataAsString());

  const output = await mainResult.awaitStableValue();
  expect(output).toBeDefined();

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

tplTest('run-fake-python', async ({ helper, expect }) => {
  const customTestText = 'hello from fake python';

  const result = await helper.renderTemplate(
    false,
    'exec.test.run.fake_python',
    ['main'],
    (tx) => ({
      text: tx.createValue(Pl.JsonObject, JSON.stringify(customTestText)),
    }),
  );
  const mainResult = result.computeOutput('main', (a) => a?.getDataAsString());

  const output = await mainResult.awaitStableValue();
  expect(output).toBeDefined();

  const lines = output!.split('\n');

  expect(lines).length(7, `original output:\n${output}`);
  expect(lines[0].trim()).toBe('cmd = "python"');
  expect(lines[1].trim()).toBe('arg[0] = "got fake python by dependency"');
  if (!lines[2].trim().startsWith('arg[1] = "pkg=/'))
    throw new Error(`line[2] not starts with pkg=/`);
  if (!lines[3].trim().startsWith('arg[2] = "python=/'))
    throw new Error(`line[3] not starts with python=/`);
  expect(lines[4].trim()).toBe(`arg[3] = "${customTestText}"`);
});
