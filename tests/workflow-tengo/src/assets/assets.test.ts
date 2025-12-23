/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { tplTest } from '@platforma-sdk/test';

tplTest.concurrent('software-metadata-loads', async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    'assets.import-software',
    ['main'],
    (tx) => ({}),
  );
  const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());

  const val = await mainResult.awaitStableValue() as {
    name: string;
    version: string;
    blobRef: any;
    descriptor: any;
    execs: string[];
  };

  expect(val.name).eq('@platforma-sdk/workflow-tengo-tests:assets.software-meta');
  expect(val.version).not.eq('');
  expect(val.execs.length).gt(0);
  expect(val).toHaveProperty('blobRef');
  expect(val).toHaveProperty('descriptor');
});

tplTest.concurrent('asset-metadata-loads', async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    'assets.import-asset',
    ['main'],
    (tx) => ({}),
  );
  const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());

  const val = await mainResult.awaitStableValue() as {
    name: string;
    version: string;
    blobRef: any;
    descriptor: any;
    execs: string[];
  };

  expect(val.name).eq('@platforma-sdk/workflow-tengo-tests:assets.asset-meta');
  expect(val.version).not.eq('');
  expect(val).toHaveProperty('blobRef');
  expect(val).toHaveProperty('descriptor');
});

tplTest.concurrent('real-asset-download', async ({ helper, expect, driverKit }) => {
  const result = await helper.renderTemplate(
    false,
    'assets.real-asset-download',
    ['main'],
    (tx) => ({}),
  );

  // Wait for asset content
  const assetContentOutput = result.computeOutput('main', (a) => a?.getData()?.toString());
  const assetContent = await assetContentOutput.awaitStableValue();

  expect(assetContent).toEqual('file1.txt content\n');
});
