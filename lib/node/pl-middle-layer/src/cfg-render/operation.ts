import { Computable, TrackedAccessorProvider } from '@milaboratory/computable';

export type ArgumentKey = string;

export interface ExecutionEnvironment {
  accessor<A>(provider: TrackedAccessorProvider<A>): A;
}

export type ArgumentValues = Record<ArgumentKey, unknown>;
export type ArgumentRequests = Record<ArgumentKey, Operation>;

export type Subroutine = (args: ArgumentValues) => Operation;

export type CallSubroutine = {
  type: 'CallSubroutine'
  subroutine: Subroutine,
  args: ArgumentRequests
}

export type ReturnResult = {
  type: 'ReturnResult'
  result: unknown
}

export type AwaitComputable = {
  type: 'AwaitComputable'
  computable: Computable<unknown>
}

export type OperationAction = CallSubroutine | AwaitComputable | ReturnResult;

export type Operation = (e: ExecutionEnvironment) => OperationAction;
