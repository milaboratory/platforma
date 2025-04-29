import type { PFrameFactoryAPI } from './api_factory';
import type { PFrameReadAPIV5 } from './api_read';

export type Logger = (
  level: 'info' | 'warn' | 'error',
  message: string
) => void;

export interface PFrameV5 extends PFrameFactoryAPI, PFrameReadAPIV5 {}
