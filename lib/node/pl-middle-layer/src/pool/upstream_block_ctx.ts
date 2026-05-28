import type { ComputableCtx } from "@milaboratories/computable";
import type { PlTreeEntry, PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { notEmpty } from "@milaboratories/ts-helpers";
import type { UpstreamBlockCtx } from "@milaboratories/pl-model-common";
import type { ProjectStructure } from "../model/project_model";
import { ProjectStructureKey, projectFieldName } from "../model/project_model";
import { allBlocks, stagingGraph } from "../model/project_model_util";

export type { UpstreamBlockCtx } from "@milaboratories/pl-model-common";

/**
 * Collect upstream-block ctx accessors for the given root block.
 *
 * For each upstream block (per the staging graph) we try to resolve its
 * `prodUiCtx` and `stagingUiCtx` resources. Only the `.ok` outcomes are
 * surfaced; failures and missing fields collapse to `undefined`.
 *
 * SDK-side providers compose enumerate/status/data operations on top of these
 * accessors using the helpers in `column_providers/accessor_traversal`.
 *
 * Note: this function is the only place that reads the project tree to build
 * the upstream-pool view — the legacy `ResultPool` class is not used.
 */
export function collectUpstreamBlockCtx(
  ctx: ComputableCtx,
  prjEntry: PlTreeEntry,
  rootBlockId: string,
): UpstreamBlockCtx<PlTreeNodeAccessor>[] {
  const prj = ctx.accessor(prjEntry).node();
  const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));
  const graph = stagingGraph(structure);
  const targetBlocks = graph.traverseIds("upstream", rootBlockId);

  const out: UpstreamBlockCtx<PlTreeNodeAccessor>[] = [];
  for (const blockInfo of allBlocks(structure)) {
    if (!targetBlocks.has(blockInfo.id)) continue;

    const prod = resolveCtxAccessor(prj, blockInfo.id, "prod");
    const staging = resolveCtxAccessor(prj, blockInfo.id, "staging");

    const prodIncomplete = prod.calculated && prod.accessor === undefined;
    const stagingIncomplete = staging.calculated && staging.accessor === undefined;

    out.push({
      blockId: blockInfo.id,
      prodCtx: prod.accessor,
      stagingCtx: staging.accessor,
      prodIncomplete: prodIncomplete || undefined,
      stagingIncomplete: stagingIncomplete || undefined,
    });
  }
  return out;
}

interface CtxProbe {
  /** True if the ctx-holder field exists in the project tree (block has started rendering). */
  readonly calculated: boolean;
  /** Resolved ui-ctx accessor (only when `.ok`). */
  readonly accessor: PlTreeNodeAccessor | undefined;
}

function resolveCtxAccessor(
  prj: PlTreeNodeAccessor,
  blockId: string,
  kind: "prod" | "staging",
): CtxProbe {
  const ctxField = kind === "prod" ? "prodCtx" : "stagingCtx";
  const uiCtxField = kind === "prod" ? "prodUiCtx" : "stagingUiCtx";

  const calculated =
    prj.traverse({
      field: projectFieldName(blockId, ctxField),
      ignoreError: true,
      pureFieldErrorToUndefined: true,
      stableIfNotFound: true,
    }) !== undefined;

  const uiCtx = prj.traverseOrError({
    field: projectFieldName(blockId, uiCtxField),
    stableIfNotFound: true,
  });

  if (uiCtx === undefined || !uiCtx.ok) return { calculated, accessor: undefined };
  return { calculated, accessor: uiCtx.value };
}
