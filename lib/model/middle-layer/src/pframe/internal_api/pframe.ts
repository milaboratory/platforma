import type { PFrameFactoryAPI } from './api_factory';
import type { PFrameReadAPIV4, PFrameReadAPIV5 } from './api_read';

export type Logger = (
  level: 'info' | 'warn' | 'error',
  message: string
) => void;

export interface PFrameV4 extends PFrameFactoryAPI, PFrameReadAPIV4 {}

export interface PFrameV5 extends PFrameFactoryAPI, PFrameReadAPIV5 {}
