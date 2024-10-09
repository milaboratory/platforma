import { test } from 'vitest';
import { createDefaultLocalConfigs, PlConfigOptions } from '@milaboratories/pl-config';
import { ConsoleLoggerAdapter, sleep } from '@milaboratories/ts-helpers';
import path from 'path';
import { LocalPlOptions, Pl, platformaInit } from '@milaboratories/pl-local';
import { PlClient, UnauthenticatedPlClient } from '@milaboratories/pl-client';
import { MiddleLayer } from '@milaboratories/pl-middle-layer';

test(
  'should generate config, start local platforma and middle-layer from this config, create project, stop everything gracefully',
  { timeout: 15000 },
  async ({ expect }) => {
    const logger = new ConsoleLoggerAdapter();
    const workingDir = path.join(__dirname, ".test");

    // create configs for everything
    const configOpts: PlConfigOptions = {
      logger,
      workingDir,
      portsMode: {
        type: 'random',
        from: 11234,
        to: 11237
      },
      licenseMode: { type: 'env' }
    }
    const configs = await createDefaultLocalConfigs(configOpts);

    // start local platforma
    const plOpts: LocalPlOptions = {
      workingDir: configs.workingDir,
      config: configs.plLocal,
      binary: {
        type: 'Download',
        dir: path.join(configs.workingDir, 'binaries'),
        version: configs.plVersion
      },
      spawnOptions: {},
      closeOld: true,
      onCloseAndErrorNoStop: async (pl: Pl) => await pl.start()
    }
    const plLocal = await platformaInit(logger, plOpts);

    // start pl-client
    const uaClient = new UnauthenticatedPlClient(configs.clientAddr);
    while (true) {
      try {
        await uaClient.ping();
        break;
      } catch (e) {
        await sleep(30);
      }
    }
    const auth = await uaClient.login(configs.user, configs.password);
    const client = await PlClient.init(configs.clientAddr, { authInformation: auth })

    // start midlle-layer
    const ml = await MiddleLayer.init(client, configs.ml);

    // assertions that everything is working
    expect(await plLocal.isAlive()).toBeTruthy();
    const rId = await ml.createProject({ label: 'abc' });
    console.log('Project was created: ', rId);
    console.log('Local platforma info: %o', plLocal.debugInfo());
    expect(rId).not.toBe(0);

    // stop everything
    await ml.close();
    client.close();
    plLocal.stop();
    await plLocal.waitStopped();
  }
)

