import { ComputableCtx } from '@milaboratory/computable';
import { PlTreeEntry, PlTreeNodeAccessor } from '@milaboratory/pl-tree';
import {
  Option,
  PObject,
  PObjectSpec,
  PSpecPredicate,
  Ref,
  ResultCollection,
  ResultPoolEntry,
  TreeNodeAccessor,
  ValueOrError,
  executePSpecPredicate
} from '@milaboratory/sdk-ui';
import { notEmpty } from '@milaboratory/ts-helpers';
import {
  Block,
  ProjectStructure,
  ProjectStructureKey,
  projectFieldName
} from '../model/project_model';
import { allBlocks, stagingGraph } from '../model/project_model_util';
import { Pl } from '@milaboratory/pl-client-v2';
import { Optional, Writable } from 'utility-types';
import { derivePObjectId } from './data';

/** All exported results are addressed  */
export type ResultKey = Pick<Ref, 'blockId' | 'name'>;

/** Represents current information about particular block */
interface PoolBlock {
  /** Meta information from the project structure */
  readonly info: Block;
  /** Production ctx, if exists. If block's prod was executed, this field is guaranteed to be defined. */
  readonly prod?: PoolCtx;
  /** Staging ctx, if exists. If staging was rendered, this field is guaranteed to be defined. */
  readonly staging?: PoolCtx;
}

/** Represents specific staging or prod ctx data */
interface PoolCtx {
  /** true if no new results are expected */
  readonly locked: boolean;
  /** results by name */
  readonly results: Map<string, PoolResult>;
}

/** Single result in a particular ctx */
interface PoolResult {
  /**
   * true - means this result has data field, however it may still be not ready
   * false - means it can be derived that this result incarnation is spec-only
   * undefined - means that it is not yet known
   * */
  readonly hasData?: boolean;

  /** Result may be added even if there is no data associated with it */
  readonly spec?: PObjectSpec;

  /**
   * Returns data accessor, or error, or undefined if data not yet available.
   * If data fuinction itself is not defined, this means that corresponding context
   * was not rendered.
   * */
  data?(): ValueOrError<PlTreeNodeAccessor, string> | undefined;
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

  public getBlockLabel(blockId: string): string {
    return notEmpty(this.blocks.get(blockId)?.info?.label, `block "${blockId}" not found`);
  }

  public getData(): ResultCollection<PObject<PlTreeNodeAccessor>> {
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
    return { entries, isComplete: resultWithErrors.isComplete };
  }

  public getDataWithErrors(): ResultCollection<
    Optional<PObject<ValueOrError<PlTreeNodeAccessor, string>>, 'id'>
  > {
    const entries: ResultPoolEntry<
      Optional<PObject<ValueOrError<PlTreeNodeAccessor, string>>, 'id'>
    >[] = [];
    let isComplete = true;

    const tryAddEntry = (blockId: string, exportName: string, result: PoolResult) => {
      if (result.spec !== undefined && result.hasData === true && result.data !== undefined) {
        const data = result.data();
        if (data !== undefined) {
          entries.push({
            ref: {
              __isRef: true,
              blockId,
              name: exportName
            },
            obj: {
              id: data.ok ? derivePObjectId(result.spec, data.value) : undefined,
              spec: result.spec,
              data
            }
          });
        } else isComplete = false; // because data will eventually be resolved
      }
    };

    for (const [blockId, block] of this.blocks) {
      const exportsProcessed = new Set<string>();

      if (block.prod !== undefined) {
        if (!block.prod.locked) isComplete = false;
        for (const [exportName, result] of block.prod.results) {
          // any signal that this expost will be (or already is) present in the prod
          // will prevent adding it from staging
          exportsProcessed.add(exportName);
          tryAddEntry(blockId, exportName, result);
        }
      }

      if (block.staging !== undefined) {
        if (!block.staging.locked) isComplete = false;

        for (const [exportName, result] of block.staging.results) {
          // trying to add soemthing only if result is absent in prod
          if (exportsProcessed.has(exportName)) continue;
          tryAddEntry(blockId, exportName, result);
        }
      }
    }

    return { entries, isComplete };
  }

  public getSpecs(): ResultCollection<PObjectSpec> {
    const entries: ResultPoolEntry<PObjectSpec>[] = [];
    let isComplete = true;
    for (const [blockId, block] of this.blocks) {
      const exportsProcessed = new Set<string>();
      if (block.staging !== undefined) {
        if (!block.staging.locked) isComplete = false;

        for (const [exportName, result] of block.staging.results)
          if (result.spec !== undefined) {
            entries.push({
              ref: {
                __isRef: true,
                blockId,
                name: exportName
              },
              obj: result.spec
            });
            exportsProcessed.add(exportName);
          }
      } else isComplete = false; // because staging will be inevitably rendered soon

      if (block.prod !== undefined) {
        if (!block.prod.locked) isComplete = false;
        for (const [exportName, result] of block.prod.results) {
          // staging have higher priority when we are interested in specs
          if (exportsProcessed.has(exportName)) continue;

          if (result.spec !== undefined) {
            entries.push({
              ref: {
                __isRef: true,
                blockId,
                name: exportName
              },
              obj: result.spec
            });
          }
        }
      }
    }

    return { entries, isComplete };
  }

  public calculateOptions(predicate: PSpecPredicate): ExtendedOption[] {
    const found: ExtendedOption[] = [];
    for (const block of this.blocks.values()) {
      const exportsChecked = new Set<string>();
      const addToFound = (ctx: PoolCtx) => {
        const ret: ExtendedOption[] = [];
        for (const [exportName, result] of ctx.results) {
          if (exportsChecked.has(exportName) || result.spec === undefined) continue;
          exportsChecked.add(exportName);
          if (executePSpecPredicate(predicate, result.spec))
            found.push({
              label: block.info.label + ' / ' + exportName,
              ref: { __isRef: true, name: exportName, blockId: block.info.id },
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
          pureFieldErrorToUndefined: true
        })
      );
      const staging = loadCtx(
        prj.traverse({
          field: projectFieldName(blockInfo.id, 'stagingCtx'),
          ignoreError: true,
          pureFieldErrorToUndefined: true
        })
      );

      blocks.set(blockInfo.id, { info: blockInfo, prod, staging });
    }

    return new ResultPool(ctx, blocks);
  }
}

const BContextValuePrefix = 'values/';
const BContextValueSpecSuffix = '.spec';
const BContextValueDataSuffix = '.data';

const BContextValuePattern = /^values\/(?<name>.*)\.(?<type>spec|data)$/;

/** Loads single BContext data */
function loadCtx(ctxHolderAccessor: PlTreeNodeAccessor | undefined): PoolCtx | undefined {
  if (ctxHolderAccessor === undefined) return undefined;

  const ctxNode = ctxHolderAccessor.traverse({
    field: Pl.HolderRefField,
    assertFieldType: 'Input',
    ignoreError: true,
    pureFieldErrorToUndefined: true
  });

  if (ctxNode === undefined)
    // this case defines the situation when ctx holder is present, but the ctx itself is
    // not yet available, to simplify the logic we make this situation indistinguishable
    // from empty unlocked cotext
    return { locked: false, results: new Map() };

  const results = new Map<string, Writable<PoolResult>>();
  for (const fieldName of ctxNode.listInputFields()) {
    const match = fieldName.match(BContextValuePattern);
    if (!match) continue;
    const name = notEmpty(match.groups?.name);
    const type = notEmpty(match.groups?.type) as 'spec' | 'data';
    let result = results.get(name);
    if (result === undefined) {
      result = {};
      results.set(name, result);
    }

    switch (type) {
      case 'spec':
        result.spec = ctxNode
          .traverse({ field: fieldName, ignoreError: true, pureFieldErrorToUndefined: true })
          ?.getDataAsJson();
        break;
      case 'data':
        result.hasData = true;
        result.data = () =>
          ctxNode.traverseOrError({
            field: fieldName,
            ignoreError: true
          });
      default:
        // other value types planned
        continue;
    }
  }

  const ctxLocked = ctxNode.getInputsLocked();
  if (ctxLocked)
    for (const [, result] of results) if (result.data === undefined) result.hasData = false;

  return { locked: ctxLocked, results };
}
