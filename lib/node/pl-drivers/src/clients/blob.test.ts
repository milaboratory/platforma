import { PlClient, ResourceId, TestHelpers } from "@milaboratory/pl-client-v2";
import { ClientBlob } from "../clients/blob";
import { Dispatcher } from "undici";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { ConsoleLoggerAdapter } from "@milaboratory/ts-helpers";

test('integration test, grpc upload blob should throw error on NOT_FOUND', async () => {
  await TestHelpers.withTempRoot(async client => {
    const logger = new ConsoleLoggerAdapter();
    const clientBlob = client.getDriver({
      name: 'UploadBlob',
      init: (pl: PlClient, grpcTransport: GrpcTransport, httpDispatcher: Dispatcher) =>
        new ClientBlob(grpcTransport, httpDispatcher, client, logger)
    })

    try {
      await clientBlob.initUpload({id: 1n as ResourceId, type: {name: 'BlobUpload/primary', version: '1'}});
      fail('should throw NOT_FOUND')
    } catch(e) {
      const err = e as any;
      expect(err.code).toBe('NOT_FOUND');
    }
  })
})
