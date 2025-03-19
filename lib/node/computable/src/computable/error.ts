import * as util from 'node:util';

export function formatError(error: unknown): string {
  const formatted = util.format(error);

  if ('message' in (error as any) && typeof (error as any).message === 'string') {
    return `${(error as any).message}

full error:
${formatted}`;
  }

  return formatted;
}
