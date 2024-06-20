import { AnyResourceRef, PlTransaction } from '@milaboratory/pl-client-v2';
import {
  FrontendFromFolderData, FrontendFromFolderResourceType,
  FrontendFromUrlData,
  FrontendFromUrlResourceType,
  FrontendSpec
} from '../../model';
import { assertNever } from '@milaboratory/ts-helpers';

export function createFrontend(tx: PlTransaction, spec: FrontendSpec): AnyResourceRef {
  switch (spec.type) {
    case 'url':
      return tx.createValue(FrontendFromUrlResourceType,
        JSON.stringify({ url: spec.url } as FrontendFromUrlData));
    case 'local':
      return tx.createValue(FrontendFromFolderResourceType,
        JSON.stringify({
          path: spec.path,
          signature: spec.signature
        } as FrontendFromFolderData));
    default:
      return assertNever(spec);
  }
}

