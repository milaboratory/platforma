import type { AnyResourceRef, PlTransaction } from "@milaboratories/pl-client";
import type {
  FrontendFromFolderData,
  FrontendFromLocalTgzData,
  FrontendFromUrlData,
  FrontendSpec,
} from "../../model";
import {
  FrontendFromFolderResourceType,
  FrontendFromLocalTgzResourceType,
  FrontendFromUrlResourceType,
} from "../../model";
import { assertNever } from "@milaboratories/ts-helpers";

export function createFrontend(tx: PlTransaction, spec: FrontendSpec): AnyResourceRef {
  switch (spec.type) {
    case "url":
      return tx.createValue(
        FrontendFromUrlResourceType,
        JSON.stringify({ url: spec.url } as FrontendFromUrlData),
      );
    case "local":
      return tx.createValue(
        FrontendFromFolderResourceType,
        JSON.stringify({
          path: spec.path,
          signature: spec.signature,
        } as FrontendFromFolderData),
      );
    case "local-tgz":
      return tx.createValue(
        FrontendFromLocalTgzResourceType,
        JSON.stringify({
          path: spec.path,
          mtime: spec.mtime,
          signature: spec.signature,
        } as FrontendFromLocalTgzData),
      );
    default:
      return assertNever(spec);
  }
}
