import type {
  AnyRef,
  AnyFieldRef,
  PlTransaction,
  ResourceRef,
  ResourceType,
} from "@milaboratories/pl-client";
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

/**
 * Creates the heavy block render. With `baggage`, it also creates the root action context of the
 * render and sets its baggage, in the same transaction. The baggage gets a new random `run-id`: each
 * render is one run of the block, and the child contexts copy it. Returns `actionContext`: a reference to the
 * render's "actionContext" field. The render is garbage collected after its outputs resolve, so the caller
 * must hold this reference to keep the context. Without `actionContextApi:v1` on the backend, nothing is
 * created and `status` is undefined.
 */
export function createRenderHeavyBlock(
  tx: PlTransaction,
  tpl: AnyRef,
  inputs: HeavyBlockInputs,
  baggage?: BlockActionContextBaggage,
): HeavyBlockOutputs & { actionContext?: AnyFieldRef } {
  const { render, outputs } = createRenderTemplateWithResource(
    tx,
    tpl,
    true,
    inputs,
    HeavyBlockOutputNames,
  );

  if (baggage === undefined || !tx.actionContextApiEnabled) return outputs;

  const renderActionContext = tx.actionContext(render);
  renderActionContext.create();
  renderActionContext.setBaggage("name", baggage.name);
  renderActionContext.setBaggage("block-pack", baggage.blockPack);
  renderActionContext.setBaggage("block-id", baggage.blockId);
  renderActionContext.setBaggage("run-id", randomUUID());

  return { ...outputs, actionContext: field(render, "actionContext") };
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
