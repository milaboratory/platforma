import { isErrorLike, tryDo } from '@milaboratories/helpers';

// order of errors is important, we will show first
export function getErrorMessage(...errors: unknown[]): undefined | string {
  for (let i = 0; i < errors.length; i++) {
    const error = errors[i];
    const message = extractMessage(error);
    if (message !== undefined) return message;
  }
}

function extractMessage(error: unknown): undefined | string {
  if (typeof error === 'string') {
    return error;
  }

  if (isErrorLike(error) && error.message.length > 0) {
    return error.message;
  }

  if (error != null) {
    const unknownString = tryDo(() => JSON.stringify(error, null, 4), () => String(error));
    return `Unknown error message:\n${unknownString}`;
  }

  return undefined;
}
