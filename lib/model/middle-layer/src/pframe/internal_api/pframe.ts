import type { PFrameFactoryAPIV2 } from './api_factory';
import type { PFrameReadAPIV8 } from './api_read';

export type Logger = (
  level: 'info' | 'warn' | 'error',
  message: string
) => void;

export interface PFrameV9 extends PFrameFactoryAPIV2, PFrameReadAPIV8 {}
