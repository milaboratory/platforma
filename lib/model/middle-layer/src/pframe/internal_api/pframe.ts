import { PFrameReadAPI, PFrameFactoryAPI, PFrameReadAPIV2 } from './index';

export interface PFrame extends PFrameFactoryAPI, PFrameReadAPI {
}

export interface PFrameV2 extends PFrameFactoryAPI, PFrameReadAPIV2 {
}
