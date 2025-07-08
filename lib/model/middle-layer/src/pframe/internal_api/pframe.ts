import type { PFrameFactoryAPI } from './api_factory';
import type { PFrameReadAPIV8 } from './api_read';

export type Logger = (
  level: 'info' | 'warn' | 'error',
  message: string
) => void;

export interface PFrameV8 extends PFrameFactoryAPI, PFrameReadAPIV8 {}
