import { ArgumentKey, ArgumentValues, ExecutionEnvironment, Operation, Subroutine } from './operation';
import Denque from 'denque';
import { assertNever, notEmpty } from '@milaboratory/ts-helpers';
import {
  Computable,
  computableInstancePosprocessor, ComputableRenderingOps, lazyFactory,
  TrackedAccessorProvider
} from '@milaboratory/computable';
import { Cfg } from '@milaboratory/sdk-block-config';
import { renderCfg, resOp } from './renderer';

type SubroutineKey = symbol;

type Destination = {
  op: SubroutineKey,
  arg: ArgumentKey
}

const ReturnOpKey: unique symbol = Symbol();
const ReturnArgKey = 'return';

const ReturnDestination = { op: ReturnOpKey, arg: ReturnArgKey } as Destination;

function isReturnDestination(destination: Destination): Boolean {
  return destination.op == ReturnOpKey && destination.arg == ReturnArgKey;
}

type ScheduledOperation = {
  operation: Operation;
  destination: Destination;
}

type ScheduledComputable = {
  destination: Destination;
  computable: Computable<unknown>;
}

type MaterializedComputable = {
  destination: Destination;
  computable: unknown;
}

type PendingSubroutine = {
  subroutine: Subroutine;
  destination: Destination;
  argCounter: number;
  args: ArgumentValues;
}

type ExecutionStack = {
  result?: unknown
  pendingSubroutines: Map<SubroutineKey, PendingSubroutine>
}

function zeroStack(): ExecutionStack {
  return { pendingSubroutines: new Map<SubroutineKey, PendingSubroutine>() };
}

function execute(env: ExecutionEnvironment, stack: ExecutionStack,
                 operations: ScheduledOperation[],
                 allowComputables: boolean): ScheduledComputable[] {
  const scheduled = new Denque<ScheduledOperation>(operations);

  /** Returns false if final result is set as result of this operation,
   * true if we should continue processing. */
  const deliverResult = (destination: Destination, result: unknown): boolean => {
    if (isReturnDestination(destination)) {
      stack.result = result;
      return false;
    }

    const pending = stack.pendingSubroutines.get(destination.op)!;
    if (destination.arg in pending.args)
      throw new Error('argument already set');
    pending.args[destination.arg] = result;
    pending.argCounter--;
    if (pending.argCounter === 0) {
      stack.pendingSubroutines.delete(destination.op);
      scheduled.push({
        destination: pending.destination,
        operation: pending.subroutine(pending.args)
      });
    }

    return true;
  };

  const computables: ScheduledComputable[] = [];

  mainLoop: while (scheduled.length > 0) {
    const op = scheduled.shift()!;
    const action = op.operation(env);
    switch (action.type) {

      case 'ReturnResult':
        if (!deliverResult(op.destination, action.result))
          break mainLoop;
        break; // switch

      case 'CallSubroutine':
        const newOpKey = Symbol();

        const argRequests = Object.entries(action.args);
        const initialArgCounter = argRequests.length;
        for (const [arg, operation] of argRequests)
          scheduled.push({
            destination: { op: newOpKey, arg },
            operation
          });

        stack.pendingSubroutines.set(newOpKey, {
          argCounter: initialArgCounter,
          args: {},
          subroutine: action.subroutine,
          destination: op.destination
        });
        break;

      case 'AwaitComputable':
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

const PostProcessingExecutionEnvironment: ExecutionEnvironment = {
  accessor<A>(provider: TrackedAccessorProvider<A>): A {
    throw new Error('can\'t create accessors in post-processing context');
  }
};

export function computableFromCfg(ctx: Record<string, unknown>, cfg: Cfg, ops: Partial<ComputableRenderingOps> = {}): Computable<unknown> {
  return computableInstancePosprocessor(lazyFactory(), ops, a => {
    const env: ExecutionEnvironment = {
      accessor<A>(provider: TrackedAccessorProvider<A>): A {
        return a.get(provider);
      }
    };
    const stack = zeroStack();
    const computables = execute(env, stack, [{
      destination: ReturnDestination,
      operation: renderCfg(ctx, cfg)
    }], true);
    return {
      ir: computables,
      async postprocessValue(value: MaterializedComputable[], stable: boolean): Promise<unknown> {
        const resolvedOps: ScheduledOperation[] = [];
        for (const mc of value)
          resolvedOps.push({ destination: mc.destination, operation: resOp(mc.computable) });
        execute(PostProcessingExecutionEnvironment, stack, resolvedOps, false);
        if (!('result' in stack))
          throw new Error('illegal cfg rendering stack state, no result');
        return stack.result;
      }
    };
  });
}
