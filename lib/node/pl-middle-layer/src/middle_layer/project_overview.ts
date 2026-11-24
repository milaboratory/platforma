import type { PlTreeEntry, PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import type { ComputableStableDefined } from "@milaboratories/computable";
import { Computable } from "@milaboratories/computable";
import type { ProjectRenderingState, ProjectStructure } from "../model/project_model";
import {
  BlockRenderingStateKey,
  ProjectCreatedTimestamp,
  projectFieldName,
  ProjectLastModifiedTimestamp,
  ProjectMetaKey,
  ProjectStructureAuthorKey,
  ProjectStructureKey,
} from "../model/project_model";
import { notEmpty } from "@milaboratories/ts-helpers";
import { allBlocks, productionGraph } from "../model/project_model_util";
import type { MiddleLayerEnvironment } from "./middle_layer";
import type {
  AuthorMarker,
  BlockCalculationStatus,
  BlockSettings,
  ProjectMeta,
  ProjectOverview,
} from "@milaboratories/pl-model-middle-layer";
import { constructBlockContext, constructBlockContextArgsOnly } from "./block_ctx";
import { ifNotUndef } from "../cfg_render/util";
import { type BlockSection, BLOCK_STORAGE_FACADE_VERSION } from "@platforma-sdk/model";
import type { BlockModel } from "./block_model";
import {
  blockModelFeatureFlags,
  blockModelOf,
  blockModelSdkVersion,
  blockTitle,
} from "./block_model";
import { computableFromCfgOrRF } from "./render";
import type { NavigationStates } from "./navigation_states";
import { getBlockPackInfo } from "./util";
import { resourceIdToString, type SignedResourceId } from "@milaboratories/pl-client";
import { omitBy, isEqual } from "es-toolkit";
import { getDebugFlags } from "../debug";
import { readArgsErrorsField } from "../model/args_derivation";

type BlockInfo = {
  argsRid?: SignedResourceId;
  currentArguments: unknown;
  prod?: ProdState;
};

type ProdState = {
  finished: boolean;

  outputError: boolean;

  outputsError?: string;

  exportsError?: string;

  stale: boolean;

  /** Arguments current production was rendered with. */
  arguments: Record<string, unknown>;
};

function argsEquals(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const cleanA = omitBy(a, (_, key) => key.startsWith("__"));
  const cleanB = omitBy(b, (_, key) => key.startsWith("__"));
  return isEqual(cleanA, cleanB);
}

/** Returns derived general project state form the project resource */
export function projectOverview(
  prjEntry: PlTreeEntry,
  navigationStates: NavigationStates,
  env: MiddleLayerEnvironment,
): ComputableStableDefined<ProjectOverview> {
  return Computable.make(
    (ctx) => {
      const prj = ctx.accessor(prjEntry).node();

      const created = notEmpty(prj.getKeyValueAsJson<number>(ProjectCreatedTimestamp));
      const lastModified = notEmpty(prj.getKeyValueAsJson<number>(ProjectLastModifiedTimestamp));

      const meta = notEmpty(prj.getKeyValueAsJson<ProjectMeta>(ProjectMetaKey));
      const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));
      const renderingState = notEmpty(
        prj.getKeyValueAsJson<ProjectRenderingState>(BlockRenderingStateKey),
      );

      const infos = new Map<string, BlockInfo>();
      for (const { id } of allBlocks(structure)) {
        const cInputs = prj.traverse({
          field: projectFieldName(id, "currentArgs"),
          assertFieldType: "Dynamic",
          stableIfNotFound: true,
        });
        const currentArguments = cInputs?.getDataAsJson<Record<string, unknown>>();

        let prod: ProdState | undefined = undefined;

        const rInputs = prj.traverse({
          field: projectFieldName(id, "prodArgs"),
          assertFieldType: "Dynamic",
          stableIfNotFound: true,
        });
        if (rInputs !== undefined) {
          const prodArgs = rInputs.getDataAsJson() as Record<string, unknown>;
          const result = prj.getField({
            field: projectFieldName(id, "prodOutput"),
            assertFieldType: "Dynamic",
            errorIfFieldNotFound: true,
          });
          const ctx = prj.getField({
            field: projectFieldName(id, "prodUiCtx"),
            assertFieldType: "Dynamic",
            errorIfFieldNotFound: true,
          });
          prod = {
            arguments: prodArgs,
            stale: !argsEquals(currentArguments, prodArgs),
            outputError:
              result.error !== undefined ||
              ctx.error !== undefined ||
              result.value?.getError() !== undefined ||
              ctx.value?.getError() !== undefined,
            outputsError:
              result.error?.getDataAsString() ?? result.value?.getError()?.getDataAsString(),
            exportsError: ctx.error?.getDataAsString() ?? ctx.value?.getError()?.getDataAsString(),
            finished:
              ((result.value !== undefined && result.value.getIsReadyOrError()) ||
                (result.error !== undefined && result.error.getIsReadyOrError())) &&
              ((ctx.value !== undefined && ctx.value.getIsReadyOrError()) ||
                (ctx.error !== undefined && ctx.error.getIsReadyOrError())),
          };
        }

        infos.set(id, { currentArguments, prod, argsRid: cInputs?.resourceInfo.id });
      }

      const currentGraph = productionGraph(structure, (id) => {
        const bpInfo = getBlockPackInfo(prj, id)!;
        const bInfo = infos.get(id)!;
        const args = bInfo.currentArguments;
        return {
          args,
          enrichmentTargets: bInfo.argsRid
            ? env.projectHelper.getEnrichmentTargets(
                () => bpInfo.cfg,
                () => args,
                { argsRid: bInfo.argsRid, blockPackRid: bpInfo.bpResourceId },
              )
            : undefined,
        };
      });

      const limbo = new Set(renderingState.blocksInLimbo);

      const blocks = [...allBlocks(structure)].map(({ id, label: defaultLabel, renderingMode }) => {
        const info = notEmpty(infos.get(id));
        const gNode = notEmpty(currentGraph.nodes.get(id));
        let calculationStatus: BlockCalculationStatus = "NotCalculated";
        if (info.prod !== undefined) {
          if (limbo.has(id)) calculationStatus = "Limbo";
          else calculationStatus = info.prod.finished ? "Done" : "Running";
        }

        const bp = getBlockPackInfo(prj, id);
        const model = blockModelOf(bp, env);
        const title = blockTitle(env, prjEntry, id, model, defaultLabel);
        const { sections, subtitle, tags, inputsValid, inputsValidFromArgs } =
          model.type === "ready" ? readyBlockLambdas(env, prjEntry, prj, id, model, info) : {};
        const sdkVersion = blockModelSdkVersion(model);
        const featureFlags = blockModelFeatureFlags(model);
        const isIncompatibleWithRuntime =
          model.type === "absent" ? undefined : model.type !== "ready";

        const settings = prj
          .traverse({
            field: projectFieldName(id, "blockSettings"),
            assertFieldType: "Dynamic",
            errorIfFieldNotSet: true,
          })
          .getDataAsJson() as BlockSettings;

        const updates = ifNotUndef(bp, ({ info }) =>
          env.blockUpdateWatcher.get({ currentSpec: info.source, settings }),
        );

        return {
          projectResourceId: resourceIdToString(prjEntry.rid),
          id,
          label: title,
          title,
          subtitle,
          tags,
          renderingMode,
          stale: info.prod?.stale !== false || calculationStatus === "Limbo",
          missingReference: gNode.missingReferences,
          upstreams: [...currentGraph.traverseIdsExcludingRoots("upstream", id)],
          downstreams: [...currentGraph.traverseIdsExcludingRoots("downstream", id)],
          calculationStatus,
          outputErrors: info.prod?.outputError === true,
          outputsError: info.prod?.outputsError,
          exportsError: info.prod?.exportsError,
          settings,
          sections,
          inputsValid,
          inputsValidFromArgs: inputsValidFromArgs === true,
          updateInfo: {},
          currentBlockPack: bp?.info?.source,
          updates,
          sdkVersion,
          featureFlags,
          isIncompatibleWithRuntime,
          navigationState: navigationStates.getState(id),
        };
      });

      return {
        meta,
        created: new Date(created),
        lastModified: new Date(lastModified),
        authorMarker: prj.getKeyValueAsJson<AuthorMarker>(ProjectStructureAuthorKey),
        blocks,
      };
    },
    {
      postprocessValue: (value) => ({
        ...value,
        blocks: withRunState(value.blocks).map(({ updates, inputsValidFromArgs: _, ...b }) => ({
          ...b,
          updateSuggestions: updates?.suggestions ?? [],
          updatedBlockPack: updates?.mainSuggestion,
        })),
      }),
      // Each computable a project overview is nested into would render its own copy of it: the
      // model lambdas of every block of the project.
      nesting: "rootOnly",
      onRecalculation: getDebugFlags().logProjectOverviewStat
        ? (stats) => {
            console.log(`[projectOverview] ${JSON.stringify(stats)}`);
          }
        : undefined,
    },
  ).withStableType();
}

/**
 * The lambdas of a block's runnable model the overview shows besides its title: sections, subtitle
 * and tags, and whether its inputs are valid.
 */
function readyBlockLambdas(
  env: MiddleLayerEnvironment,
  prjEntry: PlTreeEntry,
  prj: PlTreeNodeAccessor,
  id: string,
  model: Extract<BlockModel, { type: "ready" }>,
  info: BlockInfo,
) {
  const {
    pack: { bpId, cfg, info: blockPackInfo },
    codeWithInfo,
  } = model;
  const blockCtx = constructBlockContext(prjEntry, id);
  const blockCtxArgsOnly = constructBlockContextArgsOnly(prjEntry, id);
  return {
    sections: computableFromCfgOrRF(
      env,
      blockCtx,
      cfg.sections,
      codeWithInfo,
      bpId,
      {},
      blockPackInfo.source,
    ).wrap({
      recover: (cause) => {
        env.logger.error(new Error("Error in block model sections", { cause }));
        return [];
      },
    }) as ComputableStableDefined<BlockSection[]>,
    subtitle: ifNotUndef(
      cfg.subtitle,
      // The subtitle names the inputs the block reads, so it renders with the
      // result pool; the title stays args-only.
      (subtitle) =>
        computableFromCfgOrRF(
          env,
          blockCtx,
          subtitle,
          codeWithInfo,
          bpId,
          {},
          blockPackInfo.source,
        ).wrap({
          recover: (cause) => {
            env.logger.error(new Error("Error in block model subtitle", { cause }));
            return "Invalid subtitle";
          },
        }) as ComputableStableDefined<string>,
    ),
    tags: ifNotUndef(
      cfg.tags,
      (tags) =>
        computableFromCfgOrRF(
          env,
          blockCtx,
          tags,
          codeWithInfo,
          bpId,
          {},
          blockPackInfo.source,
        ).wrap({
          recover: (cause) => {
            env.logger.error(new Error("Error in block model tags", { cause }));
            return [];
          },
        }) as ComputableStableDefined<string[]>,
    ),
    // inputsValid: for modelAPIVersion 2, it's true if currentArgs exists (args derivation succeeded)
    // and the block's argsIssues() is known to have found no errors in them.
    // For older blocks, use the inputsValid callback from config
    inputsValid:
      cfg.modelAPIVersion === BLOCK_STORAGE_FACADE_VERSION
        ? argsAllowRun(prj, id, info.currentArguments)
        : cfg.inputsValid
          ? (computableFromCfgOrRF(env, blockCtxArgsOnly, cfg.inputsValid, codeWithInfo, bpId).wrap(
              {
                recover: (cause) => {
                  env.logger.error(new Error("Error in block model inputsValid", { cause }));
                  return false;
                },
              },
            ) as ComputableStableDefined<boolean>)
          : undefined,
    inputsValidFromArgs: cfg.modelAPIVersion === BLOCK_STORAGE_FACADE_VERSION,
  };
}

/**
 * Whether the args of a block with model API version 2 let it run: the block has current args,
 * and its `inputsValid` field records no errors its `argsIssues()` found in them (see
 * `readArgsErrorsField`).
 *
 * @param currentArgs - The block's current args as decoded from its `currentArgs` field;
 *   `undefined` when it has none
 */
export function argsAllowRun(
  prj: PlTreeNodeAccessor,
  blockId: string,
  currentArgs: unknown,
): boolean {
  if (currentArgs === undefined) return false;
  const argsErrors = prj.getField({
    field: projectFieldName(blockId, "inputsValid"),
    assertFieldType: "Dynamic",
    stableIfNotFound: true,
  });
  return readArgsErrorsField(argsErrors?.value?.getData(), currentArgs).length === 0;
}

/** What the run state of a block is derived from. */
export type RunStateSource = {
  id: string;
  /** Whether the block's own args differ from those its results were rendered with. */
  stale: boolean;
  outputErrors: boolean;
  inputsValid: boolean | undefined;
  /**
   * Whether `inputsValid` tells only whether the block's current args may run: a block with model
   * API version 2 this runtime is compatible with. Otherwise it also stands for a block whose code
   * cannot run here, or for checks of a model that predates args issues.
   */
  inputsValidFromArgs: boolean;
  missingReference: boolean;
  /** Every block upstream of this one, direct or not. */
  upstreams: string[];
};

/**
 * Adds the run state to each block of a project, the blocks listed upstream first. A block is
 * stale when its own args changed or an upstream block is stale. It can run when it needs to run
 * (it is stale or its outputs failed), its args allow it, it references no missing block, and no
 * upstream block that needs to run is kept from running. An upstream block whose `inputsValid`
 * comes from its args and whose results are up to date feeds its dependents even when its args
 * could not run again; any other upstream block that is not valid keeps them from running.
 */
export function withRunState<B extends RunStateSource>(
  blocks: B[],
): (B & { stale: boolean; canRun: boolean })[] {
  const cantRun = new Set<string>();
  const staleBlocks = new Set<string>();
  return blocks.map((b) => {
    if (b.stale) staleBlocks.add(b.id);
    const stale = b.stale || b.upstreams.some((u) => staleBlocks.has(u));
    const needsRun = stale || b.outputErrors;
    if (!b.inputsValid && (needsRun || !b.inputsValidFromArgs)) cantRun.add(b.id);
    const canRun =
      needsRun &&
      Boolean(b.inputsValid) &&
      !b.missingReference &&
      !b.upstreams.some((u) => cantRun.has(u));
    return { ...b, stale, canRun };
  });
}
