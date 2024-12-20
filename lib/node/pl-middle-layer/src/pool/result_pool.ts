import { ComputableCtx } from '@milaboratories/computable';
import { PlTreeEntry, PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import {
  Option,
  PObject,
  PObjectSpec,
  PSpecPredicate,
  PlRef,
  ResultCollection,
  ResultPoolEntry,
  ValueOrError,
  executePSpecPredicate,
  mapValueInVOE
} from '@platforma-sdk/model';
import { notEmpty } from '@milaboratories/ts-helpers';
import { outputRef } from '../model/args';
import {
  Block,
  ProjectStructure,
  ProjectStructureKey,
  projectFieldName
} from '../model/project_model';
import { allBlocks, stagingGraph } from '../model/project_model_util';
import { Optional } from 'utility-types';
import { deriveGlobalPObjectId } from './data';
import {
  RawPObjectCollection,
  RawPObjectEntry,
  parseRawPObjectCollection
} from './p_object_collection';

/** All exported results are addressed  */
export type ResultKey = Pick<PlRef, 'blockId' | 'name'>;

/** Represents current information about particular block */
interface PoolBlock {
  /** Meta information from the project structure */
  readonly info: Block;
  /** Production ctx, if exists. If block's prod was executed, this field is guaranteed to be defined. */
  readonly prod?: RawPObjectCollection;
  /** Staging ctx, if exists. If staging was rendered, this field is guaranteed to be defined. */
  readonly staging?: RawPObjectCollection;
}

export interface ExtendedResultCollection<T> extends ResultCollection<T> {
  readonly instabilityMarker: string | undefined;
}

export interface ExtendedOption extends Option {
  readonly spec: PObjectSpec;
}

export class ResultPool {
  private readonly allSpecsAvailable: boolean;
  private constructor(
    private readonly ctx: ComputableCtx,
    private readonly blocks: Map<string, PoolBlock>
  ) {
    let allSpecsAvailable = true;
    outer: for (const block of blocks.values()) {
      for (const ctx of [block.prod, block.staging])
        if (ctx !== undefined) {
          if (!ctx.locked) {
            allSpecsAvailable = false;
            break outer;
          }
          for (const result of ctx.results.values()) {
            if (result.spec === undefined) {
              allSpecsAvailable = false;
              break outer;
            }
          }
        }
    }
    this.allSpecsAvailable = allSpecsAvailable;
  }

  public getSpecByRef(blockId: string, exportName: string): PObjectSpec | undefined {
    const block = this.blocks.get(blockId);
    if (block === undefined) return undefined;
    let result = block.prod?.results?.get(exportName)?.spec;
    if (result !== undefined) return result;
    result = block.staging?.results?.get(exportName)?.spec;
    if (result !== undefined) return result;
    if (block.staging === undefined) this.ctx.markUnstable(`staging_not_rendered:${blockId}`);
    else if (!block.staging.locked) this.ctx.markUnstable(`staging_not_locked:${blockId}`);
    else if (block.prod !== undefined && !block.prod.locked)
      this.ctx.markUnstable(`prod_not_locked:${blockId}`);
    // if prod is absent, returned undefined value is considered stable
    return undefined;
  }

  public getDataOrErrorByRef(
    blockId: string,
    exportName: string
  ): ValueOrError<PObject<PlTreeNodeAccessor>, string> | undefined {
    const block = this.blocks.get(blockId);
    if (block === undefined) return undefined;
    let result = block.prod?.results?.get(exportName);
    let data = result?.data?.();
    if (result !== undefined && result.spec !== undefined && data !== undefined)
      return mapValueInVOE(data, (value) => ({
        id: deriveGlobalPObjectId(blockId, exportName),
        spec: result!.spec!,
        data: value
      }));
    if (result !== undefined) this.ctx.markUnstable(`no_data:${blockId}:${exportName}`);
    if (block.prod !== undefined && !block.prod.locked)
      this.ctx.markUnstable(`prod_not_locked:${blockId}`);
    // if prod is absent, returned undefined value is considered stable
    return undefined;
  }

  public getDataByRef(
    blockId: string,
    exportName: string
  ): PObject<PlTreeNodeAccessor> | undefined {
    const res = this.getDataOrErrorByRef(blockId, exportName);
    if (res === undefined || !res.ok) return undefined;
    return res.value;
  }

  public getData(): ExtendedResultCollection<PObject<PlTreeNodeAccessor>> {
    const resultWithErrors = this.getDataWithErrors();
    const entries: ResultPoolEntry<PObject<PlTreeNodeAccessor>>[] = [];
    for (const res of resultWithErrors.entries)
      if (res.obj.id !== undefined && res.obj.data.ok)
        entries.push({
          ref: res.ref,
          obj: {
            id: res.obj.id,
            spec: res.obj.spec,
            data: res.obj.data.value
          }
        });
    return {
      entries,
      isComplete: resultWithErrors.isComplete,
      instabilityMarker: resultWithErrors.instabilityMarker
    };
  }

  public getDataWithErrors(): ExtendedResultCollection<
    Optional<PObject<ValueOrError<PlTreeNodeAccessor, string>>, 'id'>
  > {
    const entries: ResultPoolEntry<
      Optional<PObject<ValueOrError<PlTreeNodeAccessor, string>>, 'id'>
    >[] = [];
    let isComplete = true;

    let instabilityMarker: string | undefined = undefined;
    const markUnstable = (marker: string) => {
      if (instabilityMarker === undefined) instabilityMarker = marker;
      isComplete = false;
    };

    const tryAddEntry = (blockId: string, exportName: string, result: RawPObjectEntry) => {
      if (result.spec !== undefined && result.hasData === true && result.data !== undefined) {
        const data = result.data();
        if (data !== undefined) {
          entries.push({
            ref: outputRef(blockId, exportName),
            obj: {
              id: data.ok ? deriveGlobalPObjectId(blockId, exportName) : undefined,
              spec: result.spec,
              data
            }
          });
        } else markUnstable(`no_data:${blockId}:${exportName}`); // because data will eventually be resolved
      }
    };

    for (const [blockId, block] of this.blocks) {
      const exportsProcessed = new Set<string>();

      if (block.prod !== undefined) {
        if (!block.prod.locked) markUnstable(`prod_not_locked:${blockId}`);
        for (const [exportName, result] of block.prod.results) {
          // any signal that this export will be (or already is) present in the prod
          // will prevent adding it from staging
          exportsProcessed.add(exportName);
          tryAddEntry(blockId, exportName, result);
        }
      }

      if (block.staging !== undefined) {
        if (!block.staging.locked) markUnstable(`staging_not_locked:${blockId}`);

        for (const [exportName, result] of block.staging.results) {
          // trying to add something only if result is absent in prod
          if (exportsProcessed.has(exportName)) continue;
          tryAddEntry(blockId, exportName, result);
        }
      }
    }

    return { entries, isComplete, instabilityMarker };
  }

  public getSpecs(): ExtendedResultCollection<PObjectSpec> {
    const entries: ResultPoolEntry<PObjectSpec>[] = [];

    let isComplete = true;

    let instabilityMarker: string | undefined = undefined;
    const markUnstable = (marker: string) => {
      if (instabilityMarker === undefined) instabilityMarker = marker;
      isComplete = false;
    };

    for (const [blockId, block] of this.blocks) {
      const exportsProcessed = new Set<string>();
      if (block.staging !== undefined) {
        if (!block.staging.locked) markUnstable(`staging_not_locked:${blockId}`);

        for (const [exportName, result] of block.staging.results)
          if (result.spec !== undefined) {
            entries.push({
              ref: outputRef(blockId, exportName),
              obj: result.spec
            });
            exportsProcessed.add(exportName);
          }
      } else markUnstable(`staging_not_rendered:${blockId}`); // because staging will be inevitably rendered soon

      if (block.prod !== undefined) {
        if (!block.prod.locked) markUnstable(`prod_not_locked:${blockId}`);
        for (const [exportName, result] of block.prod.results) {
          // staging have higher priority when we are interested in specs
          if (exportsProcessed.has(exportName)) continue;

          if (result.spec !== undefined) {
            entries.push({
              ref: outputRef(blockId, exportName),
              obj: result.spec
            });
          }
        }
      }
    }

    return { entries, isComplete, instabilityMarker };
  }

  public calculateOptions(predicate: PSpecPredicate): ExtendedOption[] {
    const found: ExtendedOption[] = [];
    for (const block of this.blocks.values()) {
      const exportsChecked = new Set<string>();
      const addToFound = (ctx: RawPObjectCollection) => {
        const ret: ExtendedOption[] = [];
        for (const [exportName, result] of ctx.results) {
          if (exportsChecked.has(exportName) || result.spec === undefined) continue;
          exportsChecked.add(exportName);
          if (executePSpecPredicate(predicate, result.spec))
            found.push({
              label: block.info.label + ' / ' + exportName,
              ref: outputRef(block.info.id, exportName),
              spec: result.spec
            });
        }
      };
      if (block.staging !== undefined) addToFound(block.staging);
      if (block.prod !== undefined) addToFound(block.prod);
    }
    return found;
  }

  public static create(ctx: ComputableCtx, prjEntry: PlTreeEntry, rootBlockId: string): ResultPool {
    const prj = ctx.accessor(prjEntry).node();

    const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));
    const graph = stagingGraph(structure);
    const targetBlocks = graph.traverseIds('upstream', rootBlockId);

    const blocks = new Map<string, PoolBlock>();

    for (const blockInfo of allBlocks(structure)) {
      if (!targetBlocks.has(blockInfo.id)) continue;

      const prod = loadCtx(
        prj.traverse({
          field: projectFieldName(blockInfo.id, 'prodCtx'),
          ignoreError: true,
          pureFieldErrorToUndefined: true,
          stableIfNotFound: true
        }) !== undefined,
        prj.traverseOrError({
          field: projectFieldName(blockInfo.id, 'prodUiCtx'),
          stableIfNotFound: true
        })
      );
      const staging = loadCtx(
        prj.traverse({
          field: projectFieldName(blockInfo.id, 'stagingCtx'),
          ignoreError: true,
          pureFieldErrorToUndefined: true
        }) !== undefined,
        prj.traverseOrError({
          field: projectFieldName(blockInfo.id, 'stagingUiCtx')
        })
      );

      blocks.set(blockInfo.id, { info: blockInfo, prod, staging });
    }

    return new ResultPool(ctx, blocks);
  }
}

/** Loads single BContext data */
function loadCtx(
  calculated: boolean,
  ctxAccessor: ValueOrError<PlTreeNodeAccessor, string> | undefined
): RawPObjectCollection | undefined {
  if (ctxAccessor === undefined) {
    if (calculated)
      // this case defines the situation when ctx holder is present, but the ctx itself is
      // not yet available, to simplify the logic we make this situation indistinguishable
      // from empty unlocked cotext
      return { locked: false, results: new Map() };
    else return undefined;
  }

  if (ctxAccessor.ok) return parseRawPObjectCollection(ctxAccessor.value, false, true);
  else return undefined;
}
