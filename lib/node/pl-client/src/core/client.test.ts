import { getTestClient, getTestClientConf } from '../test/test_config';
import { PlClient } from './client';
import { PlDriver, PlDriverDefinition } from './driver';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { Dispatcher, request } from 'undici';

test('test client init', async () => {
  const client = await getTestClient(undefined, false);
  await client.init();
});

test('test client alternative root init', async () => {
  const aRootName = 'test_root';
  const { conf, authInformation } = await getTestClientConf();
  const clientA = new PlClient({ ...conf, alternativeRoot: aRootName }, { authInformation });
  await clientA.init();
  const clientB = new PlClient(conf, { authInformation });
  await clientB.init();
  const result = await clientB.deleteAlternativeRoot(aRootName);
  expect(result).toBe(true);
});

test('test client init', async () => {
  const client = await getTestClient();
});

interface SimpleDriver extends PlDriver {
  ping(): Promise<string>;
}

const SimpleDriverDefinition: PlDriverDefinition<SimpleDriver> = {
  name: 'SimpleDriver',
  init(pl: PlClient, grpcTransport: GrpcTransport, httpDispatcher: Dispatcher): SimpleDriver {
    return {
      async ping(): Promise<string> {
        const response = await request('https://cdn.milaboratory.com/ping', { dispatcher: httpDispatcher });
        return await response.body.text();
      },
      close() {
      }
    };
  }
};

test('test driver', async () => {
  const client = await getTestClient();
  const drv = client.getDriver(SimpleDriverDefinition);
  expect(await drv.ping()).toEqual('pong');
});
