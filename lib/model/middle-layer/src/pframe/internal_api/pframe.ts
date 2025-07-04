import type { PFrameFactoryAPI } from './api_factory';
import type { PFrameReadAPIV7, PFrameReadAPIV8 } from './api_read';

export type Logger = (
  level: 'info' | 'warn' | 'error',
  message: string
) => void;

export interface PFrameV7 extends PFrameFactoryAPI, PFrameReadAPIV7 {}

export interface PFrameV8 extends PFrameFactoryAPI, PFrameReadAPIV8 {}
