import type { AnyResourceRef, PlTransaction } from '@milaboratories/pl-client';
import type {
  FrontendFromFolderData,
  FrontendFromUrlData,
  FrontendSpec
} from '../../model';
import {
  FrontendFromFolderResourceType,
  FrontendFromUrlResourceType
} from '../../model';
import { assertNever } from '@milaboratories/ts-helpers';

export function createFrontend(tx: PlTransaction, spec: FrontendSpec): AnyResourceRef {
  switch (spec.type) {
    case 'url':
      return tx.createValue(
        FrontendFromUrlResourceType,
        JSON.stringify({ url: spec.url } as FrontendFromUrlData)
      );
    case 'local':
      return tx.createValue(
        FrontendFromFolderResourceType,
        JSON.stringify({
          path: spec.path,
          signature: spec.signature
        } as FrontendFromFolderData)
      );
    default:
      return assertNever(spec);
  }
}
