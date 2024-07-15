import { DriverKit } from '@milaboratory/sdk-model';
import { BackendPFrameDriver, PFrameInternal } from './pframe';

/** Driver Kit exposed by the Middle Layer */
export type BackendDriverKit = Omit<DriverKit, 'pFrameDriver'> & {
  pFrameDriver: BackendPFrameDriver;
};
