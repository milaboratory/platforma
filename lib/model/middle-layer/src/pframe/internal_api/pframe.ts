import type { PFrameFactoryAPI } from './api_factory';
import type { PFrameReadAPIV6, PFrameReadAPIV7 } from './api_read';

export type Logger = (
  level: 'info' | 'warn' | 'error',
  message: string
) => void;

export interface PFrameV6 extends PFrameFactoryAPI, PFrameReadAPIV6 {}

export interface PFrameV7 extends PFrameFactoryAPI, PFrameReadAPIV7 {}
