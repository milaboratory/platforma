import type { Computable } from "@milaboratories/computable";
import type { PlTreeEntry, PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import type { BlockCodeFeatureFlags, BlockCodeWithInfo } from "@milaboratories/pl-model-common";
import { extractCodeWithInfo, wrapCallback } from "@platforma-sdk/model";
import type { MiddleLayerEnvironment } from "./middle_layer";
import { constructBlockContextArgsOnly } from "./block_ctx";
import { computableFromCfgOrRF } from "./render";
import type { BlockPackInfoAndId } from "./util";
import { getBlockPackInfo } from "./util";

/** What the model of a block is to this runtime. */
export type BlockModel =
  /** the project holds no block pack for the block */
  | { readonly type: "absent" }
  /** the model requires something this runtime does not support, so its code is not run */
  | { readonly type: "incompatible"; readonly featureFlags: BlockCodeFeatureFlags | undefined }
  /** the model has no code that can be run */
  | {
      readonly type: "broken";
      readonly message: string;
      readonly featureFlags: BlockCodeFeatureFlags | undefined;
    }
  /** the model's code can be run */
  | {
      readonly type: "ready";
      readonly pack: BlockPackInfoAndId;
      readonly codeWithInfo: BlockCodeWithInfo;
    };

/** The model of a block, read from its block pack in the project. */
export function readBlockModel(
  prj: PlTreeNodeAccessor,
  blockId: string,
  env: Pick<MiddleLayerEnvironment, "runtimeCapabilities">,
): BlockModel {
  return blockModelOf(getBlockPackInfo(prj, blockId), env);
}

/** The model of a block whose block pack is `pack`. */
export function blockModelOf(
  pack: BlockPackInfoAndId | undefined,
  env: Pick<MiddleLayerEnvironment, "runtimeCapabilities">,
): BlockModel {
  if (pack === undefined) return { type: "absent" };
  const { featureFlags } = pack.cfg;
  if (!env.runtimeCapabilities.checkCompatibility(featureFlags))
    return { type: "incompatible", featureFlags };
  const codeWithInfo = wrapCallback(() => extractCodeWithInfo(pack.cfg));
  if (codeWithInfo.error)
    return { type: "broken", message: codeWithInfo.error.message, featureFlags };
  return { type: "ready", pack, codeWithInfo: codeWithInfo.value };
}

/**
 * The feature flags of a block's model: those its code was built with, an empty set for code
 * built without any, and those the config declares for a model whose code is not run.
 */
export function blockModelFeatureFlags(model: BlockModel): BlockCodeFeatureFlags | undefined {
  switch (model.type) {
    case "absent":
      return undefined;
    case "incompatible":
    case "broken":
      return model.featureFlags;
    case "ready":
      return model.codeWithInfo.featureFlags ?? {};
  }
}

/** The SDK version the code of a block's model was built with; undefined for code that is not run. */
export function blockModelSdkVersion(model: BlockModel): string | undefined {
  return model.type === "ready" ? model.codeWithInfo.sdkVersion : undefined;
}

/**
 * The title of a block, as the project shows it: what the title lambda of its model renders from
 * the block's args, why a model without runnable code fails, or else the label the block got in
 * the project. A title lambda that fails renders "Invalid title"; one that renders no string
 * leaves the block untitled.
 */
export function blockTitle(
  env: MiddleLayerEnvironment,
  prjEntry: PlTreeEntry,
  blockId: string,
  model: BlockModel,
  defaultLabel: string,
): string | Computable<string | undefined> {
  switch (model.type) {
    case "absent":
    case "incompatible":
      return defaultLabel;
    case "broken":
      return model.message;
    case "ready": {
      const { pack, codeWithInfo } = model;
      if (pack.cfg.title === undefined) return defaultLabel;
      return computableFromCfgOrRF(
        env,
        constructBlockContextArgsOnly(prjEntry, blockId),
        pack.cfg.title,
        codeWithInfo,
        pack.bpId,
        {},
        pack.info.source,
      ).wrap({
        postprocessValue: parseTitle,
        recover: (cause) => {
          env.logger.error(new Error("Error in block model title", { cause }));
          return "Invalid title";
        },
      });
    }
  }
}

// Internals

/** A title lambda renders a string; anything else leaves the block untitled. */
function parseTitle(rendered: unknown): string | undefined {
  return typeof rendered === "string" ? rendered : undefined;
}
