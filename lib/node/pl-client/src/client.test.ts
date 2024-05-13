
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { ChannelCredentials } from '@grpc/grpc-js';
import { MaintenanceAPI_Ping_Response } from './proto/github.com/milaboratory/pl/plapi/plapiproto/api';

// test('simple pl client test', async () => {
//   // const grpcOptions = this.grpcOptions = {
//   //    host: clientOptions.host,
//   //    channelCredentials: ssl ? ChannelCredentials.createSsl(
//   //      ssl.rootCerts,
//   //      ssl.privateKey,
//   //      ssl.certChain,
//   //      ssl.verifyOptions
//   //    ) : ChannelCredentials.createInsecure(),
//   //    clientOptions: {
//   //       interceptors,
//   //    },
//   // };
//
//   const transport = new GrpcTransport({
//     host: '127.0.0.1:6345',
//     channelCredentials: ChannelCredentials.createInsecure()
//   });
//
//   const client = new PlClient(transport);
//
//   const response = await client.ping();
// });
