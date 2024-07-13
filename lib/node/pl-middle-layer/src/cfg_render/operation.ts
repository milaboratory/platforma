import { DownloadDriver, LogsDriver, UploadDriver } from '@milaboratory/pl-drivers';
import { Computable, ComputableCtx } from '@milaboratory/computable';
import { MiddleLayerDriverKit } from '../middle_layer/driver_kit';

export type ArgumentKey = string;

export type ExecutionEnvironment = {
  /** Each configuration is rendered inside a computable callback, this is the
   * context of the computable we are rendering inside. */
  cCtx: ComputableCtx;
  /** Available drivers */
  drivers: MiddleLayerDriverKit;
};

export type ArgumentValues = Record<ArgumentKey, unknown>;
export type ArgumentRequests = Record<ArgumentKey, Operation>;

export type Subroutine = (args: ArgumentValues) => Operation;

export type ScheduleSubroutine = {
  type: 'ScheduleSubroutine';
  subroutine: Subroutine;
  args: ArgumentRequests;
};

export type ScheduleComputable = {
  type: 'ScheduleComputable';
  computable: Computable<unknown>;
};

export type ReturnResult = {
  type: 'ReturnResult';
  result: unknown;
};

export type OperationAction = ScheduleSubroutine | ScheduleComputable | ReturnResult;

export type Operation = (e: ExecutionEnvironment) => OperationAction;
