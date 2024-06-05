import { ResourceId, ResourceType } from '@milaboratory/pl-client-v2';

export interface ResourceInfo {
  readonly id: ResourceId;
  readonly type: ResourceType;
}

// TODO: move this logic to a computable that uploads blobs.
// export class NoHandleFieldError extends Error {}

// export async function getHandleValue(client: PlClient, blobId: AnyResourceRef): Promise<BasicResourceData> {
//   return await client.withReadTx(
//     'GetHandleFieldTSUploadDriver',
//     async (tx: PlTransaction) => {
//       const f = await tx.getField({
//         resourceId: blobId,
//         fieldName: 'handle',
//       })

//       if (isNullResourceId(f.value)) {
//         throw new NoHandleFieldError(
//           'no handle field: resource ' + blobId,
//         );
//       }

//       return await tx.getResourceData(f.value, false);
//     });
// }
