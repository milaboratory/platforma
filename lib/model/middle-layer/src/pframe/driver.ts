import { PFrame, PFrameHandle, PTable, PTableHandle } from '@milaboratory/sdk-model';
import { AddParameterToAllMethods } from './type_util';

export interface PFrameDriverMiddleLayer extends AddParameterToAllMethods<PFrame, [handle: PFrameHandle]> {
}

export interface PTableDriverMiddleLayer extends AddParameterToAllMethods<PTable, [handle: PTableHandle]> {
}
