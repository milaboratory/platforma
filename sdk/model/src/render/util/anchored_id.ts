import { AnchorCtx, isPColumnSpec, PColumnSpec } from "@milaboratories/pl-model-common";
import { RenderCtx } from "../api";
import { deriveLabels, LabelDerivationOps } from "./label";

export function getGeneralizedIdOptions(
    ctx: RenderCtx<unknown, unknown>,
    anchorsOrCtx: AnchorCtx | Record<string, PColumnSpec>,
    predicate: (spec: PColumnSpec) => boolean,
    labelOps?: LabelDerivationOps,
  ): { label: string; value: string }[] {
    const filtered = ctx.resultPool.getSpecs().entries.filter(({ obj: spec }) => isPColumnSpec(spec) && predicate(spec));
    const anchorCtx = anchorsOrCtx instanceof AnchorCtx ? anchorsOrCtx : new AnchorCtx(anchorsOrCtx);
    return deriveLabels(filtered, (o) => o.obj, labelOps ?? {}).map(({ value: { obj: spec }, label }) => ({
      value: anchorCtx.deriveAIdString(spec as PColumnSpec)!,
      label,
    }));
  }
  