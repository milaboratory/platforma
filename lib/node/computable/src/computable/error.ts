import * as util from 'node:util';

export function formatError(error: unknown): string {
  return util.format(error);
}
