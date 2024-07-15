import {
  ArgumentKey,
  ArgumentValues,
  ExecutionEnvironment,
  Operation,
  Subroutine
} from './operation';
import Denque from 'denque';
import { assertNever, notEmpty } from '@milaboratory/ts-helpers';
import { Computable, ComputableCtx, ComputableRenderingOps } from '@milaboratory/computable';
import { Cfg } from '@milaboratory/sdk-ui';
import { renderCfg, resOp } from './renderer';
import canonicalize from 'canonicalize';
import { BlockContextAny } from '../middle_layer/block_ctx';
import { MiddleLayerDriverKit } from '../middle_layer/driver_kit';
import { NonKeyCtxFields, toCfgContext } from '../middle_layer/block_ctx_unsafe';

/** Addresses pending subroutines inside the stack */
type SubroutineKey = symbol;

/** Represents destination of the result of an operation. I.e. when sequence of
 * subroutine invocations, and computables terminates with result, this object
 * determines to which argument of which pending subroutine it should be delivered.
 * See special value for delivery of the final "return" result. */
type Destination = {
  op: SubroutineKey;
  arg: ArgumentKey;
};

/** Special address of operation, see below. */
const ReturnOpKey: unique symbol = Symbol();
/** The same, but for the argument part of destination, see below. */
const ReturnArgKey = 'return';

/** Special destination, telling the executor that corresponding result should
 * be exposed as a final result, and execution terminate at this point. */
const ReturnDestination = { op: ReturnOpKey, arg: ReturnArgKey } as Destination;

function isReturnDestination(destination: Destination): Boolean {
  return destination.op == ReturnOpKey && destination.arg == ReturnArgKey;
}

/** Queued operation, used inside the executor */
type QueuedOperation = {
  operation: Operation;
  destination: Destination;
};

/** Queued computation, returned by the first round of config execution. Such
 * computables should be returned in the intermediate representation of the
 * enclosing computable, and after they are resolved and passed to the
 * postprocessing routine, should be injected into the execution stack to
 * finalize the computation. */
type ScheduledComputable = {
  destination: Destination;
  computable: Computable<unknown>;
};

/** This is what ScheduledComputable transforms from intermediate
 * representation to post-processing. */
type MaterializedComputable = {
  destination: Destination;
  computable: unknown;
};

/** Main entry inside the execution stack. */
type PendingSubroutine = {
  subroutine: Subroutine;
  destination: Destination;
  argCounter: number;
  args: ArgumentValues;
};

/** Execution stack. The closest concept that this object along with enclosed
 * {@link PendingSubroutine}s represent is a Continuation.
 * https://en.wikipedia.org/wiki/Continuation */
type ExecutionStack = {
  result?: unknown;
  pendingSubroutines: Map<SubroutineKey, PendingSubroutine>;
};

/** Returns initial stack value. */
function zeroStack(): ExecutionStack {
  return { pendingSubroutines: new Map<SubroutineKey, PendingSubroutine>() };
}

/** Implements main executor mechanism.
 * @param env to be passed to while executing operations
 * @param stack execution stack to continue execution from
 * @param operations operations to initiate the execution process
 * @param allowComputables if false, scheduling of async computables will result in error
 * */
function execute(
  env: ExecutionEnvironment,
  stack: ExecutionStack,
  operations: QueuedOperation[],
  allowComputables: boolean
): ScheduledComputable[] {
  const operationQueue = new Denque<QueuedOperation>(operations);

  /** Returns false if final result is set as result of this operation,
   * true if we should continue processing. */
  const deliverResult = (destination: Destination, result: unknown): boolean => {
    if (isReturnDestination(destination)) {
      stack.result = result;
      return false;
    }

    const pending = notEmpty(stack.pendingSubroutines.get(destination.op));
    if (destination.arg in pending.args) throw new Error('argument already set');
    pending.args[destination.arg] = result;
    pending.argCounter--;
    if (pending.argCounter === 0) {
      stack.pendingSubroutines.delete(destination.op);
      operationQueue.push({
        destination: pending.destination,
        operation: pending.subroutine(pending.args)
      });
    }

    return true;
  };

  // computables, scheduled during computation, are aggregated in this array,
  // and returned from the function in the end
  const computables: ScheduledComputable[] = [];

  // each loop = execution of a single queued operation
  mainLoop: while (operationQueue.length > 0) {
    const op = operationQueue.shift()!;
    const action = op.operation(env);
    switch (action.type) {
      case 'ReturnResult':
        if (!deliverResult(op.destination, action.result)) break mainLoop; // this terminates execution
        break; // switch

      case 'ScheduleSubroutine':
        const newOpKey = Symbol();

        const argRequests = Object.entries(action.args);
        const initialArgCounter = argRequests.length;

        if (initialArgCounter === 0)
          // if no pending arguments
          operationQueue.push({
            destination: op.destination,
            operation: action.subroutine({})
          });
        else {
          for (const [arg, operation] of argRequests)
            operationQueue.push({
              destination: { op: newOpKey, arg },
              operation
            });

          stack.pendingSubroutines.set(newOpKey, {
            argCounter: initialArgCounter,
            args: {},
            subroutine: action.subroutine,
            destination: op.destination
          });
        }

        break;

      case 'ScheduleComputable':
        if (!allowComputables)
          throw new Error('asynchronous operations are forbidden in this context');
        computables.push({
          destination: op.destination,
          computable: action.computable
        });
        break;

      default:
        assertNever(action);
    }
  }

  return computables;
}

//
// Computable
//

/** Main method to render configurations */
export function computableFromCfg(
  drivers: MiddleLayerDriverKit,
  bCtx: BlockContextAny,
  cfg: Cfg,
  ops: Partial<ComputableRenderingOps> = {}
): Computable<unknown> {
  return computableFromCfgUnsafe(drivers, toCfgContext(bCtx), cfg, ops);
}

export function computableFromCfgUnsafe(
  drivers: MiddleLayerDriverKit,
  ctx: Record<string, unknown>,
  cfg: Cfg,
  ops: Partial<ComputableRenderingOps> = {}
): Computable<unknown> {
  const key = canonicalize({
    ctx: Object.fromEntries(Object.entries(ctx).filter(([k]) => NonKeyCtxFields.indexOf(k) === -1)),
    cfg: cfg
  })!;
  return Computable.makeRaw(
    (c) => {
      const env: ExecutionEnvironment = { drivers, cCtx: c };
      const stack = zeroStack();
      const computables = execute(
        env,
        stack,
        [
          {
            destination: ReturnDestination,
            operation: renderCfg(ctx, cfg)
          }
        ],
        true
      );
      return {
        ir: computables,
        async postprocessValue(value: MaterializedComputable[], stable: boolean): Promise<unknown> {
          const resolvedOps: QueuedOperation[] = [];
          for (const mc of value)
            resolvedOps.push({ destination: mc.destination, operation: resOp(mc.computable) });
          const postEnv: ExecutionEnvironment = {
            drivers,
            get cCtx(): ComputableCtx {
              throw new Error('asynchronous operations are forbidden in this context');
            }
          };
          execute(postEnv, stack, resolvedOps, false);
          if (!('result' in stack)) throw new Error('illegal cfg rendering stack state, no result');
          return stack.result;
        }
      };
    },
    { ...ops, key }
  );
}
