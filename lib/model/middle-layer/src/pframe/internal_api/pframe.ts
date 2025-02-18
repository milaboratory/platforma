import type { PFrameFactoryAPI } from './api_factory';
import type { PFrameReadAPIV3 } from './api_read';

export type Logger = (
  level: 'info' | 'warn' | 'error',
  message: string
) => void;

export interface PFrameV3 extends PFrameFactoryAPI, PFrameReadAPIV3 {}
