import { isObject } from './objects';

export function isErrorLike(error: unknown): error is {
  message: string;
  name?: string;
  stack?: string;
  cause?: unknown;
} {
  if (error instanceof Error) return true;
  return isObject(error) && 'message' in error && typeof error.message === 'string';
}
