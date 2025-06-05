// order of errors is important, we will show first
export function useErrorMessage(...errors: unknown[]) {
  let message: undefined | string = undefined;

  if (data.error.length > 0) {
    message = data.error;
  } else if (typeof props.error === 'string') {
    message = props.error;
  } else if (isErrorLike(props.error)) {
    message = props.error.message;
  } else if (props.error != null) {
    const unknownString = tryDo(() => JSON.stringify(props.error, null, 4), () => String(props.error));
    message = `Unknown error type:\n${unknownString}`;
  }

  if (typeof message === 'string' && message.length === 0) {
    message = 'Empty error';
  }

  return message;
}

function extractMessage(error: unknown): undefined | string {
  if (typeof error === 'string') {
    return error;
  }

  if (isErrorLike(error)) {
    return error.message;
  }

  if (error != null) {
    const unknownString = tryDo(() => JSON.stringify(error, null, 4), () => String(error));
    message = `Unknown error type:\n${unknownString}`;
  }

  if (typeof message === 'string' && message.length === 0) {
    message = 'Empty error';
  }
}
