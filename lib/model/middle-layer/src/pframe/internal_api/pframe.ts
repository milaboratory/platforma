import type { PFrameFactoryAPI } from './api_factory';
import type { PFrameReadAPIV2 } from './api_read';

export type Logger = (
  level: 'info' | 'warn' | 'error',
  message: string
) => void;

export interface PFrameV2 extends PFrameFactoryAPI, PFrameReadAPIV2 {}
