import type { PFrameFactoryAPI } from './api_factory';
import type { PFrameReadAPIV7 } from './api_read';

export type Logger = (
  level: 'info' | 'warn' | 'error',
  message: string
) => void;

export interface PFrameV7 extends PFrameFactoryAPI, PFrameReadAPIV7 {}
