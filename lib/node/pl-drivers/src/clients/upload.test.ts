import type { PlClient, ResourceId } from '@milaboratories/pl-client';
import { TestHelpers } from '@milaboratories/pl-client';
import { ClientUpload } from '../clients/upload';
import type { Dispatcher } from 'undici';
import type { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';

test.skip('integration test, grpc upload blob should throw error on NOT_FOUND', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();
    const clientBlob = client.getDriver({
      name: 'UploadBlob',
      init: (pl: PlClient, grpcTransport: GrpcTransport, httpDispatcher: Dispatcher) =>
        new ClientUpload(grpcTransport, httpDispatcher, client, logger),
    });

    try {
      await clientBlob.initUpload({
        id: 1n as ResourceId,
        type: { name: 'BlobUpload/main', version: '1' },
      });
      fail('should throw NOT_FOUND');
    } catch (e) {
      const err = e as any;
      expect(err.code).toBe('NOT_FOUND');
    }
  });
});
