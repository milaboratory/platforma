import {
  PFrame,
  PFrameHandle,
  PTable,
  PTableHandle
} from '@milaboratory/sdk-model';
import { AddParameterToAllMethods } from './type_util';

export interface BackendPFrameDriver
  extends AddParameterToAllMethods<PFrame, [handle: PFrameHandle]>,
  AddParameterToAllMethods<PTable, [handle: PTableHandle]> {}
