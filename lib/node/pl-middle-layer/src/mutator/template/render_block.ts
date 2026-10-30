import type {
  AnyRef,
  AnyResourceRef,
  PlTransaction,
  ResourceRef,
  ResourceType,
} from "@milaboratories/pl-client";
import { field, isResourceId, parseSignedResourceId, Pl } from "@milaboratories/pl-client";
import { randomUUID } from "node:crypto";
import { createRenderTemplateWithResource } from "./render_template";

export const BContextEnd: ResourceType = { name: "BContextEnd", version: "1" };
export const BContext: ResourceType = { name: "BContext", version: "1" };
export const BContextId = "id";
export const BContextParent = "parent";
export const BContextMultiParentPrefix = "parent/";

// TODO: add implementation for dual context heavy block.
// export type BlockType =
//   | 'LightBlock'
//   | 'HeavyBlock'
//   | 'DualContextHeavyBlock';
// moved to project model ==>>>

export type HeavyBlockInputs = {
  args: AnyRef;
  blockId: AnyRef;
  isProduction: AnyRef;
  context: AnyRef;
};

export type HeavyBlockOutputs = {
  context: AnyRef;
  result: AnyRef;
};

export const HeavyBlockOutputNames: (keyof HeavyBlockOutputs)[] = ["context", "result"];

/** Baggage of the root action context of a block render. See the block action context spec. */
export type BlockActionContextBaggage = {
  /** Display name of the block. */
  name: string;
  /** JSON of the block pack spec. */
  blockPack: string;
  blockId: string;
};

/** Resource type of a block action context. See ActionContextV1Type in the backend. */
export const ActionContextType: ResourceType = { name: "ActionContext", version: "1" };

/** The capability under which the backend accepts the "actionContext" link on a render. */
export const ActionContextLinkCapability = "optionalFieldsInSchemas:v1";

/**
 * Creates the root action context of a block render: an ActionContext resource carrying the
 * baggage, with a new random `run-id`, since each render is one run of the block and the contexts
 * the templates create copy it. Undefined without baggage, or on a backend that cannot take the link.
 */
function createBlockActionContext(
  tx: PlTransaction,
  baggage: BlockActionContextBaggage | undefined,
): ResourceRef | undefined {
  if (baggage === undefined || !tx.hasCapability(ActionContextLinkCapability)) return undefined;
  return tx.createEphemeral(
    ActionContextType,
    JSON.stringify({
      name: baggage.name,
      "block-pack": baggage.blockPack,
      "block-id": baggage.blockId,
      "run-id": randomUUID(),
    }),
  );
}

/** The namespace the creator of a context reports under, as the backend reserves it. */
export const ActionContextCreatorNamespace = "core";

/** The reason recorded when the user stops a run. */
export const BlockRunCancelledReason = "cancelled";

/**
 * Marks a block run's root action context as cancelled by the user.
 *
 * Stopping a block destroys its render, and a destroyed render reports nothing, so without this
 * every node of a stopped run would read as live forever. The middle layer created the context, so
 * it reports under the creator's namespace, with the context itself as the reporting resource and
 * this machine's clock, the same key layout the backend's reporters use.
 */
export function recordBlockRunCancelled(tx: PlTransaction, context: AnyResourceRef): void {
  const reporter = isResourceId(context) ? String(parseSignedResourceId(context).globalId) : "0";
  const ns = (BigInt(Date.now()) * 1_000_000n).toString();
  tx.setKValue(
    context,
    `transition/${ActionContextCreatorNamespace}/${reporter}/${ns}`,
    JSON.stringify({ state: "Terminated", detail: "", reason: BlockRunCancelledReason }),
  );
}

/**
 * Creates the heavy block render, and with `baggage` its root action context in the same
 * transaction. Returns `actionContext`: the render is garbage collected after its outputs resolve,
 * so the caller must hold the context to keep it.
 */
export function createRenderHeavyBlock(
  tx: PlTransaction,
  tpl: AnyRef,
  inputs: HeavyBlockInputs,
  baggage?: BlockActionContextBaggage,
): HeavyBlockOutputs & { actionContext?: ResourceRef } {
  const actionContext = createBlockActionContext(tx, baggage);
  const { outputs } = createRenderTemplateWithResource(
    tx,
    tpl,
    true,
    inputs,
    HeavyBlockOutputNames,
    actionContext,
  );
  return actionContext === undefined ? outputs : { ...outputs, actionContext };
}

export type LightBlockInputs = {
  args: AnyRef;
  blockId: AnyRef;
  stagingContext: AnyRef;
  productionContext: AnyRef;
};

export type LightBlockOutput = {
  result: AnyRef;
};

export const LightBlockOutputNames: (keyof LightBlockOutput)[] = ["result"];

/**
 * Creates the light block render, with the same action context as a heavy one, so template code
 * of either kind knows its block and run.
 */
export function createRenderLightBlock(
  tx: PlTransaction,
  tpl: ResourceRef,
  inputs: LightBlockInputs,
  baggage?: BlockActionContextBaggage,
): LightBlockOutput & { actionContext?: ResourceRef } {
  const actionContext = createBlockActionContext(tx, baggage);
  const { outputs } = createRenderTemplateWithResource(
    tx,
    tpl,
    true,
    inputs,
    LightBlockOutputNames,
    actionContext,
  );
  return actionContext === undefined ? outputs : { ...outputs, actionContext };
}

export function createBContextEnd(tx: PlTransaction): ResourceRef {
  const ctx = tx.createEphemeral(BContextEnd);
  tx.lock(ctx);
  return ctx;
}

export function createBContextFromUpstreams(tx: PlTransaction, upstreamCtxs: AnyRef[]): AnyRef {
  if (upstreamCtxs.length === 0) return createBContextEnd(tx);

  if (upstreamCtxs.length === 1) return upstreamCtxs[0];

  const ctx = tx.createEphemeral(BContext);

  // setting id
  tx.createField(field(ctx, BContextId), "Input", Pl.createPlString(tx, randomUUID()));

  // setting parents
  for (let i = 0; i < upstreamCtxs.length; i++)
    tx.createField(field(ctx, `${BContextMultiParentPrefix}${i}`), "Input", upstreamCtxs[i]);

  tx.lock(ctx);

  return ctx;
}
