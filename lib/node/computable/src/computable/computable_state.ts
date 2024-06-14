import {
  ComputableKernel,
  IntermediateRenderingResult,
  ComputableCtx, tryExtractComputableKernel
} from './kernel';
import { HierarchicalWatcher } from '../hierarchical_watcher';
import { Writable } from 'utility-types';
import { assertNever } from '@milaboratory/ts-helpers';
import { ComputableHooks } from './computable_hooks';
import { Watcher } from '../watcher';
import { setImmediate } from 'node:timers';
import { AccessorLeakException, AccessorProvider, UsageGuard } from './accessor_provider';

interface ExecutionError {
  error: any;
}

function isExecutionError(r: IntermediateRenderingResult<unknown, unknown> | ExecutionError): r is ExecutionError {
  return 'error' in r;
}

/** To prevent leaking of other fields */
export function cleanIntermediateRenderingResult<IR, T>(r: IntermediateRenderingResult<IR, T>): IntermediateRenderingResult<IR, T> {
  const { ir, postprocessValue, recover } = r;
  return { ir, postprocessValue, ...(recover !== undefined && { recover }) };
}

class CellComputableContext implements ComputableCtx {
  public stable: boolean = false;
  private onDestroy?: (() => void);
  private kv?: Map<string, any>;
  /** Must be reset to "undefined", to only accumulate those observers injected
   * during a specific call*/
  public hooks: Set<ComputableHooks> | undefined = undefined;

  markUnstable(): void {
    this.stable = false;
  }

  get hasOnDestroy(): boolean {
    return this.onDestroy !== undefined;
  }

  scheduleAndResetOnDestroy(): void {
    if (this.onDestroy === undefined)
      return;
    // Scheduling execution in background
    setImmediate(this.onDestroy);
    this.onDestroy = undefined;
  }

  setOnDestroy(cb: () => void): void {
    this.scheduleAndResetOnDestroy();
    this.onDestroy = cb;
  }

  get(key: string): any | undefined {
    if (this.kv === undefined)
      return undefined;
    this.kv.get(key);
  }

  getOrCreate<T>(key: string, initializer: () => T): T {
    if (this.has(key))
      return this.get(key) as T;
    const v = initializer();
    this.set(key, v);
    return v;
  }

  has(key: string): boolean {
    return this.kv !== undefined ? this.kv.has(key) : false;
  }

  reset(key: string): void {
    if (this.kv === undefined)
      return;
    this.kv.delete(key);
  }

  set(key: string, value: any): void {
    if (this.kv === undefined)
      this.kv = new Map<string, any>();
    this.kv.set(key, value);
  }

  attacheHooks(listener: ComputableHooks): void {
    if (this.hooks === undefined)
      this.hooks = new Set();
    this.hooks.add(listener);
  }

  private _watcher: Watcher | undefined = undefined;

  public get watcher(): Watcher {
    if (this._watcher === undefined)
      throw new Error('Unexpected call.');
    return this._watcher;
  }

  private guardData: { finished: boolean } | undefined;
  private guard: UsageGuard | undefined;

  /** Cached accessors */
  private accessors: Map<AccessorProvider<unknown>, unknown> | undefined;

  accessor<A>(provider: AccessorProvider<A>): A {
    if (this.accessors === undefined)
      this.accessors = new Map<AccessorProvider<unknown>, unknown>();
    const cached = this.accessors.get(provider);
    if (cached !== undefined)
      return cached as A;
    const acc = provider.createAccessor(this, this.guard!);
    this.accessors.set(provider, acc);
    return acc;
  }

  /** Must be executed by the computable state engine before running the sync
   * kernel callback. */
  beforeCall(watcher: Watcher) {
    this.hooks?.clear();
    this._watcher = watcher;
    const guardData = { finished: false };
    this.guard = () => {
      if (guardData.finished) throw new AccessorLeakException();
    };
    this.guardData = guardData;
  }

  /** Must be executed by the computable state engine after sync kernel callback
   * execution finished. */
  afterCall() {
    this._watcher = undefined;
    this.guardData!.finished = true;
    this.guardData = undefined;
    this.guard = undefined;
    this.accessors?.clear();
  }
}

/** Incorporate current-node-related things. */
interface SelfCellState<T> {
  /** The kernel */
  readonly kernel: ComputableKernel<T>;

  /** Context instance is mutable and travels along with the kernel. */
  readonly ctx: CellComputableContext;

  /** Current node rendered result */
  readonly iResult: IntermediateRenderingResult<unknown, T> | ExecutionError;

  /**
   * Tells whether the cell itself was changed or not.
   * It is an HierarchicalWatcher without children.
   * It needs to be hierarchical since it's included in the watcher.
   */
  readonly selfWatcher: HierarchicalWatcher;
}

type ChildrenStates = Map<
  string | symbol,
  ChildStateEnvelop<unknown, unknown>
>;

export interface ChildStateEnvelop<IR, T = IR> {
  /** True if this child originates from a stable result. */
  readonly stable: boolean;

  /** True if this envelop is kept solely for caching, and not actually referenced in current value incarnation */
  readonly orphan: boolean;

  /** The child state. */
  readonly state: CellState<T>;
}

export interface CellState<T> {
  /** Will be mutated from true to false, when this state is used to calculate new updated state. */
  isLatest: boolean;

  /** Part of the state related to locally rendered state, without children states. */
  readonly selfState: SelfCellState<T>;

  /**
   * Holds all cell states of all the children this cell had.
   * The renderer (middle-layer) can drop this cache and keep only
   * the most recent children (that are in the result).
   */
  readonly childrenStates: ChildrenStates;

  /** True if self state, and all child cells are stable. */
  readonly stable: boolean;

  /** All errors for the tree rooted in this node. Includes self error and all child errors. */
  readonly allErrors: Error[];

  /** Includes selfWatcher and all children watchers. It is passed to parent Cells. */
  readonly watcher: HierarchicalWatcher;

  /** Observers injected during self rendering and rendering of all non-orphan child states */
  readonly hooks: Set<ComputableHooks> | undefined;

  /** Flag used to communicate requirement to run second state rendering for this node.
   *
   * If false there is no need to run rendering for this node. This is the case for states that didn't change since last iteration.
   *
   * True is set for all children nodes created or updated in current round, and not yet processed with second rendering stage.
   * Defined {@link value} in such cases carries previous value for retentive rendering. */
  valueNotCalculated: boolean;

  /** Rendered value including all children and undergone postprocessing (if requested by the renderer) */
  value?: unknown;
}

type IncompleteCellState<T> = Pick<
  CellState<T>,
  'selfState' | 'childrenStates'
>;

type Children = ComputableKernel<unknown>[];

/** Populates children array traversing the node tree */
function addChildren(node: unknown, children: Children) {

  // TODO do we need protection from recurrent references (i.e. cyclic dependencies) ?

  const type = typeof node;
  switch (type) {
    case 'function':
    case 'bigint':
    case 'number':
    case 'string':
    case 'boolean':
    case 'symbol':
    case 'undefined':
      return;

    case 'object':
      const kernel = tryExtractComputableKernel(node);
      if (kernel !== undefined)
        children.push(kernel);

      else if (Array.isArray(node))
        for (const nested of node)
          addChildren(nested, children);

      else
        for (const [, nested] of Object.entries(node as object))
          if (nested !== node)
            addChildren(nested, children);

      return;

    default:
      // exhaustiveness check
      assertNever(type);
  }
}

function getChildren(iResult: IntermediateRenderingResult<unknown, unknown> | ExecutionError): Children {
  if (isExecutionError(iResult)) return [];
  const children: Children = [];
  addChildren(iResult.ir, children);
  return children;
}

function calculateNodeValue(
  node: unknown,
  childStates: ChildrenStates
): any {
  const type = typeof node;
  switch (type) {
    case 'function':
    case 'bigint':
    case 'number':
    case 'string':
    case 'boolean':
    case 'symbol':
    case 'undefined':
      return node;

    case 'object':
      const kernel = tryExtractComputableKernel(node);
      if (kernel !== undefined)
        return childStates.get(kernel.key)!.state.value;

      if (Array.isArray(node))
        return node.map(child => calculateNodeValue(child, childStates));

      const newNode: any = {};
      for (const [key, child] of Object.entries(node as object))
        newNode[key] = calculateNodeValue(child, childStates);
      return newNode;

    default:
      // exhaustiveness check
      assertNever(type);
  }
}

async function runPostprocessing<IR, T>(iResult: IntermediateRenderingResult<IR, T>,
                                        childrenStates: ChildrenStates,
                                        stable: boolean): Promise<T> {
  const iv = calculateNodeValue(
    iResult.ir,
    childrenStates
  );
  return iResult.postprocessValue === undefined
    ? iv
    : await iResult.postprocessValue(iv, stable);
}

async function fillCellValue<T>(
  state: Writable<CellState<T>>,
  previousValue?: T
): Promise<void> {
  // assert !('value' in state)
  const ops = state.selfState.kernel.ops;

  let value = ops.mode === 'StableOnlyRetentive' ? previousValue : undefined;
  if (!isExecutionError(state.selfState.iResult)) {
    if (state.stable || ops.mode === 'Live') {

      // check that there are errors for nested computed instances
      if (state.allErrors.length === 0) {
        try {
          value = await runPostprocessing(state.selfState.iResult, state.childrenStates, state.stable);
        } catch (e: any) {
          // Adding postprocess error
          state.allErrors.push(e);
        }
      }
    }

    // trying to recover after nested computed or postprocessing errors, if requested by kernel
    if (state.allErrors.length !== 0 && state.selfState.iResult.recover !== undefined) {
      try {
        value = state.selfState.iResult.recover(state.allErrors);
        // successful recovery, prevents spreading of errors
        state.allErrors = [];
      } catch (e: any) {
        // Adding recovery error, if recovery itself crashed
        state.allErrors.push(e);
      }
    }
  }

  if (state.allErrors.length != 0 && ops.resetValueOnError) value = undefined;

  if (value !== undefined) state.value = value;
  state.valueNotCalculated = false;
}

function renderSelfState<T>(
  kernel: ComputableKernel<T>,
  ctx: CellComputableContext = new CellComputableContext()
): SelfCellState<T> {
  // Creating self watcher, to inject it into rendering process
  const selfWatcher = new HierarchicalWatcher();

  // Do rendering
  try {
    // stable by default
    ctx.stable = true;

    // initialize ctx for the call
    ctx.beforeCall(selfWatcher);

    // running main kernel callback
    const iResult = kernel.___kernel___(ctx);

    return { kernel, ctx, selfWatcher, iResult };
  } catch (error: any) {
    // TODO maybe it is not correct...
    // all errors are considered unstable
    ctx.stable = false;

    return { kernel, ctx, selfWatcher, iResult: { error } };
  } finally {
    // reset call-specific state
    ctx.afterCall();
  }
}

export function destroyState(_state: CellState<unknown>) {
  for (const { state } of _state.childrenStates.values())
    destroyState(state);
  _state.selfState.ctx.scheduleAndResetOnDestroy();
}

/**
 * @param children children of current state
 * @param fromStableState should be set to true if list of children was taken from a stable rendering result
 * @param cachedChildrenStates cached children states, from previous incarnation, if exist */
function calculateChildren(
  children: Children,
  fromStableState: boolean,
  cachedChildrenStates?: ChildrenStates
): ChildrenStates {
  // Tracking which children we transferred to a new state
  const transferred = new Set<string | symbol>();

  // TODO lazy initialization of children map ?
  const result: ChildrenStates = new Map();

  // Updating or creating child states
  for (const child of children) {
    const existingState = cachedChildrenStates
      ? cachedChildrenStates.get(child.key)
      : undefined;
    if (existingState !== undefined) {
      result.set(child.key, {
        state: updateCellStateWithoutValue(
          existingState.state
        ),
        stable: existingState.stable || fromStableState,
        orphan: false
      });
      transferred.add(child.key);
    } else
      result.set(child.key, {
        state: createCellStateWithoutValue(child),
        stable: fromStableState,
        orphan: false
      });
  }

  // if we are rendering child states for a stable result, we don't transfer anything from the previous cache,
  // except those children that exist in current incarnation (i.e. in children array)
  if (!fromStableState && cachedChildrenStates) {
    for (const [oldCacheKey, oldCacheEnvelop] of cachedChildrenStates) {
      // ignore children transferred in the previous loop
      if (transferred.has(oldCacheKey)) continue;

      if (oldCacheEnvelop.stable) {
        // note(!): we don't update the state for orphans
        result.set(oldCacheKey, { ...oldCacheEnvelop, orphan: true });
        // adding them to transferred list to prevent calling destroy for these nodes
        transferred.add(oldCacheKey);
      }
    }
  }

  // at this point we transferred everything we could, remaining children should be notified about destruction
  if (cachedChildrenStates) {
    for (const [key, { state }] of cachedChildrenStates) {
      // ignore children transferred in the previous loops
      if (transferred.has(key)) continue;

      // notify if was requested by the renderer
      destroyState(state);
    }
  }

  return result;
}

function finalizeCellState<T>(
  incompleteState: IncompleteCellState<T>,
  previousValue?: unknown
): CellState<T> {
  const nestedWatchers: HierarchicalWatcher[] = [];
  const allErrors: Error[] = [];
  let stable = incompleteState.selfState.ctx.stable;
  let hooks: Set<ComputableHooks> | undefined = undefined;
  for (const { orphan, state } of incompleteState.childrenStates.values()) {
    if (orphan) continue; // iterating over active children only

    nestedWatchers.push(state.watcher);
    allErrors.push(...state.allErrors);
    stable = stable && state.stable;

    if (state.hooks !== undefined) {
      if (hooks === undefined)
        hooks = new Set();
      for (const h of state.hooks)
        hooks.add(h);
    }
  }

  if (isExecutionError(incompleteState.selfState.iResult))
    allErrors.push(incompleteState.selfState.iResult.error);

  nestedWatchers.push(incompleteState.selfState.selfWatcher);

  if (incompleteState.selfState.ctx.hooks !== undefined) {
    if (hooks === undefined)
      hooks = new Set();
    for (const h of incompleteState.selfState.ctx.hooks)
      hooks.add(h);
  }

  return {
    isLatest: true,
    ...incompleteState,
    stable,
    allErrors,
    watcher: new HierarchicalWatcher(nestedWatchers),

    hooks,

    // next two fields will be rewritten on the second rendering stage
    valueNotCalculated: true,
    value: previousValue
  };
}

async function calculateValue<T>(
  state_: CellState<T>
): Promise<void> {
  if (!state_.valueNotCalculated) return;

  await Promise.all(
    [...state_.childrenStates.values()]
      .filter(({ orphan }) => !orphan)
      .map(({ state }) => calculateValue(state))
  );

  const previousValue = state_.value;
  delete state_.value;
  await fillCellValue(state_, previousValue);
}

/** First (sync) stage of rendering pipeline */
export function createCellStateWithoutValue<T>(
  core: ComputableKernel<T>
): CellState<T> {
  const selfState = renderSelfState(core);

  const children = getChildren(selfState.iResult);

  const childrenStates = calculateChildren(
    children,
    selfState.ctx.stable
  );

  return finalizeCellState(
    { selfState, childrenStates }
  );
}

export async function createCellState<T>(
  core: ComputableKernel<T>
): Promise<CellState<T>> {
  const state = createCellStateWithoutValue(core);
  await calculateValue(state);
  return state;
}

/** First (sync) stage of rendering pipeline */
export function updateCellStateWithoutValue<T>(
  cell: CellState<T>
): CellState<T> {
  // checking the chaining rule
  if (!cell.isLatest)
    throw new Error('Can\'t update state, that was already updated.');

  // checking any changes were registered for the
  if (!cell.watcher.isChanged) return cell;

  // update self state, if necessary
  const selfState = cell.selfState.selfWatcher.isChanged
    ? renderSelfState(cell.selfState.kernel, cell.selfState.ctx)
    : cell.selfState;

  // recalculating children states
  const children = getChildren(selfState.iResult);
  const childrenStates = calculateChildren(
    children,
    selfState.ctx.stable,
    cell.childrenStates
  );

  // calculating the final state
  const newState = finalizeCellState(
    { selfState, childrenStates },
    cell.value
  );

  // invalidating previous state (at this point we know that this call will produce no exceptions)
  cell.isLatest = false;

  return newState;
}

export async function updateCellState<T>(
  cell: CellState<T>
): Promise<CellState<T>> {
  const state = updateCellStateWithoutValue(cell);
  await calculateValue(state);
  return state;
}
