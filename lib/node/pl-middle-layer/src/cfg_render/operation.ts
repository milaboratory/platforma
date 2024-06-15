import { DownloadDriver, LogsDriver, UploadDriver } from '@milaboratory/pl-drivers';
import { AccessorProvider, Computable } from '@milaboratory/computable';

export type ArgumentKey = string;

export interface ExecutionEnvironment {
  downloadDriver?: DownloadDriver;
  uploadDriver?: UploadDriver;
  logsDriver?: LogsDriver;
  accessor<A>(provider: AccessorProvider<A>): A;
}

export type ArgumentValues = Record<ArgumentKey, unknown>;
export type ArgumentRequests = Record<ArgumentKey, Operation>;

export type Subroutine = (args: ArgumentValues) => Operation;

export type ScheduleSubroutine = {
  type: 'ScheduleSubroutine'
  subroutine: Subroutine,
  args: ArgumentRequests
}

export type ScheduleComputable = {
  type: 'ScheduleComputable'
  computable: Computable<unknown>
}

export type ReturnResult = {
  type: 'ReturnResult'
  result: unknown
}

export type OperationAction = ScheduleSubroutine | ScheduleComputable | ReturnResult;

export type Operation = (e: ExecutionEnvironment) => OperationAction;
