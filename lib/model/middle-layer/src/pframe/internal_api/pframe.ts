import type { PFrameFactoryAPI } from './api_factory';
import type { PFrameReadAPIV5, PFrameReadAPIV6 } from './api_read';

export type Logger = (
  level: 'info' | 'warn' | 'error',
  message: string
) => void;

export interface PFrameV5 extends PFrameFactoryAPI, PFrameReadAPIV5 {}

export interface PFrameV6 extends PFrameFactoryAPI, PFrameReadAPIV6 {}
