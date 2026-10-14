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

/** Data of the root status context of a block render. See the block status spec. */
export type BlockStatusData = {
  /** Display name of the block. */
  name: string;
  /** JSON of the block pack spec. */
  blockPack: string;
  blockId: string;
};

/** Resource type of a block status context. See StatusContextV1Type in the backend. */
export const StatusContextType: ResourceType = { name: "StatusContext", version: "1" };

/**
 * Creates the heavy block render. With `status`, it also creates the root status context of the
 * render in the same transaction: a StatusContext resource with the data, which the render's
 * one-time-writable "status" field points to. The data gets a new random `run-id`: each render is one run of the
 * block, and the contexts the templates create copy it. With `statusApi:v1` on the backend, the
 * context also gets the WaitingForInputs transition of the render under topic "core".
 * Returns `status`: the context. The render is garbage collected after its outputs resolve, so the
 * caller must hold the context to keep it.
 */
export function createRenderHeavyBlock(
  tx: PlTransaction,
  tpl: AnyRef,
  inputs: HeavyBlockInputs,
  status?: BlockStatusData,
): HeavyBlockOutputs & { status?: ResourceRef } {
  const { render, outputs } = createRenderTemplateWithResource(
    tx,
    tpl,
    true,
    inputs,
    HeavyBlockOutputNames,
  );

  if (status === undefined) return outputs;

  const context = tx.createEphemeral(
    StatusContextType,
    JSON.stringify({
      name: status.name,
      "block-pack": status.blockPack,
      "block-id": status.blockId,
      "run-id": randomUUID(),
    }),
  );
  tx.createField(field(render, "status"), "OTW", context);
  tx.status(render).recordTransition("core", "WaitingForInputs");

  return { ...outputs, status: context };
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
