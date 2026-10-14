import type { AnyRef, PlTransaction, ResourceRef, ResourceType } from "@milaboratories/pl-client";
import { field, Pl } from "@milaboratories/pl-client";
import { randomUUID } from "node:crypto";
import { createRenderTemplate, createRenderTemplateWithResource } from "./render_template";

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

/**
 * Creates the heavy block render. With `baggage`, it also creates the root action context of the
 * render in the same transaction: an ActionContext resource with the baggage, which the render's
 * one-time-writable "actionContext" field points to. The baggage gets a new random `run-id`: each render is one run of the
 * block, and the contexts the templates create copy it. With `actionContextApi:v1` on the backend, the
 * context also gets the WaitingForInputs transition of the render under namespace "core".
 * Returns `actionContext`: the context. The render is garbage collected after its outputs resolve, so the
 * caller must hold the context to keep it.
 */
export function createRenderHeavyBlock(
  tx: PlTransaction,
  tpl: AnyRef,
  inputs: HeavyBlockInputs,
  baggage?: BlockActionContextBaggage,
): HeavyBlockOutputs & { actionContext?: ResourceRef } {
  const { render, outputs } = createRenderTemplateWithResource(
    tx,
    tpl,
    true,
    inputs,
    HeavyBlockOutputNames,
  );

  if (baggage === undefined) return outputs;

  const context = tx.createEphemeral(
    ActionContextType,
    JSON.stringify({
      name: baggage.name,
      "block-pack": baggage.blockPack,
      "block-id": baggage.blockId,
      "run-id": randomUUID(),
    }),
  );
  tx.createField(field(render, "actionContext"), "OTW", context);
  tx.actionContext(render).recordTransition("core", "WaitingForInputs");

  return { ...outputs, actionContext: context };
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

export function createRenderLightBlock(
  tx: PlTransaction,
  tpl: ResourceRef,
  inputs: LightBlockInputs,
): LightBlockOutput {
  return createRenderTemplate(tx, tpl, true, inputs, LightBlockOutputNames);
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
