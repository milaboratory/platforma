import { test } from 'vitest';
import { generateLocalPlConfigs, type LocalPlConfigGeneratorOptions } from '@milaboratories/pl-config';
import { ConsoleLoggerAdapter, sleep } from '@milaboratories/ts-helpers';
import path from 'node:path';
import { type LocalPl, localPlatformaInit } from '@milaboratories/pl-deployments';
import { PlClient, UnauthenticatedPlClient } from '@milaboratories/pl-client';
import { MiddleLayer } from '@milaboratories/pl-middle-layer';

test(
  'should generate config, start local platforma and middle-layer from this config, create project, stop everything gracefully',
  { timeout: 15000 },
  async ({ expect }) => {
    const logger = new ConsoleLoggerAdapter();
    const workingDir = path.resolve(path.join(__dirname, '..', '.test'));

    // create configs for everything
    console.log('Generating configs...');
    const configOpts: LocalPlConfigGeneratorOptions = {
      logger,
      workingDir,
      portsMode: {
        type: 'random',
        from: 11234,
        to: 11239,
      },
      licenseMode: { type: 'env' },
    };
    const genResult = await generateLocalPlConfigs(configOpts);

    // start local platforma
    console.log('Starting local platforma...');
    const plLocal = await localPlatformaInit(logger, {
      workingDir: genResult.workingDir,
      config: genResult.plConfigContent,
      onCloseAndErrorNoStop: async (pl: LocalPl) => await pl.start(),
    });

    // start pl-client
    const uaClient = await UnauthenticatedPlClient.build(genResult.plAddress);
    console.log('Waiting for local platforma to be ready...');
    while (true) {
      try {
        await uaClient.ping();
        break;
      } catch (_e) {
        await sleep(30);
      }
    }
    const auth = await uaClient.login(genResult.plUser, genResult.plPassword);
    const client = await PlClient.init(genResult.plAddress, { authInformation: auth });

    // start middle-layer
    console.log('Starting middle-layer...');
    const ml = await MiddleLayer.init(client, workingDir, {
      localSecret: MiddleLayer.generateLocalSecret(),
      localProjections: genResult.localStorageProjections,
      openFileDialogCallback: () => {
        throw new Error('Not implemented.');
      },
    });

    // assertions that everything is working
    console.log('Checking if local platforma is ready...');
    expect(await plLocal.isAlive()).toBeTruthy();
    const rId = await ml.createProject({ label: 'abc' });
    console.log('Project was created: ', rId);
    console.log('Local platforma info: %o', plLocal.debugInfo());
    expect(rId).not.toBe(0);

    // stop everything
    console.log('Checking if local platforma is ready...');
    await ml.close();
    client.close();
    plLocal.stop();
    await plLocal.waitStopped();
  },
);
