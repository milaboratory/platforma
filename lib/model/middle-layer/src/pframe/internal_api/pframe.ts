import type { PFrameFactoryAPI } from './api_factory';
import type { PFrameReadAPIV4 } from './api_read';

export type Logger = (
  level: 'info' | 'warn' | 'error',
  message: string
) => void;

export interface PFrameV4 extends PFrameFactoryAPI, PFrameReadAPIV4 {}
