import type { PlTreeEntry, PlTreeEntryAccessor } from "@milaboratories/pl-tree";
import type { MiddleLayerEnvironment } from "./middle_layer";
import type { ComputableStableDefined } from "@milaboratories/computable";
import { Computable } from "@milaboratories/computable";
import { Pl, resourceTypesEqual } from "@milaboratories/pl-client";
import type {
  FrontendFromFolderData,
  FrontendFromLocalTgzData,
  FrontendFromUrlData,
} from "../model";
import {
  FrontendFromFolderResourceType,
  FrontendFromLocalTgzResourceType,
  FrontendFromUrlResourceType,
} from "../model";
import type { UrlResult } from "@milaboratories/pl-drivers";
import { projectFieldName } from "../model/project_model";
import { BlockPackFrontendField } from "../mutator/block-pack/block_pack";
import { getBlockPackInfo } from "./util";
import type { FrontendData } from "../model/frontend";

function kernel(
  frontendRes: PlTreeEntryAccessor,
  env: MiddleLayerEnvironment,
): undefined | string | ComputableStableDefined<UrlResult> {
  const node = frontendRes.node();
  if (resourceTypesEqual(node.resourceType, FrontendFromUrlResourceType)) {
    const data = node.getDataAsJson<FrontendFromUrlData>();
    if (data === undefined) throw new Error(`No resource data.`);
    return env.frontendDownloadDriver.getUrl(new URL(data.url)).withStableType();
  } else if (resourceTypesEqual(node.resourceType, FrontendFromFolderResourceType)) {
    const data = node.getDataAsJson<FrontendFromFolderData>();
    if (data === undefined) throw new Error(`No resource data.`);
    env.signer.verify(
      data.path,
      data.signature,
      `Frontend path signature mismatch for: ${data.path}`,
    );
    return data.path;
  } else if (resourceTypesEqual(node.resourceType, FrontendFromLocalTgzResourceType)) {
    const data = node.getDataAsJson<FrontendFromLocalTgzData>();
    if (data === undefined) throw new Error(`No resource data.`);
    env.signer.verify(
      `${data.path}:${data.mtime}`,
      data.signature,
      `Frontend path signature mismatch for: ${data.path}`,
    );
    // Lazily unpack the local ui.tgz through the download driver, so it
    // inherits the driver's space recycling + usage-tracking (same as the
    // registry url path), instead of serving an eagerly-unpacked folder.
    return env.frontendDownloadDriver.getLocalTgz(data.path, data.mtime).withStableType();
  } else {
    throw new Error(`Unsupported resource type: ${JSON.stringify(node.resourceType)}`);
  }
}

function frontendUrlComputable(
  entry: PlTreeEntry | undefined,
  env: MiddleLayerEnvironment,
): ComputableStableDefined<string> | undefined {
  if (entry === undefined) return undefined;
  return Computable.make(
    (c) => {
      return kernel(c.accessor(entry), env);
    },
    {
      postprocessValue: (v) => {
        if (v === undefined) return undefined;
        if (typeof v === "string") return v;
        if (v.error !== undefined) throw new Error(v.error);
        return v.url;
      },
    },
  ).withStableType();
}

export function frontendData(
  projectEntry: PlTreeEntry,
  id: string,
  env: MiddleLayerEnvironment,
): ComputableStableDefined<FrontendData> {
  return Computable.make(
    (ctx) => {
      const prj = ctx.accessor(projectEntry).node();
      const bp = getBlockPackInfo(prj, id);
      const frontendEntry = prj
        .traverse(
          {
            field: projectFieldName(id, "blockPack"),
            assertFieldType: "Dynamic",
          },
          { field: Pl.HolderRefField, assertFieldType: "Input", errorIfFieldNotFound: true },
          { field: BlockPackFrontendField, assertFieldType: "Input" },
        )
        ?.persist();
      return {
        url: frontendUrlComputable(frontendEntry, env),
        sdkVersion: bp?.cfg.sdkVersion,
      };
    },
    { mode: "StableOnlyLive" },
  ) as ComputableStableDefined<FrontendData>;
}
