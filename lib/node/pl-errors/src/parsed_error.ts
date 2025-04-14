/** Pl Backend throws arbitrary errors, and we're trying to parse them here. */

import { z } from 'zod';
import type { ResourceId, ResourceType } from '@milaboratories/pl-client';
import { resourceIdToString, resourceTypeToString } from '@milaboratories/pl-client';
import { notEmpty } from '@milaboratories/ts-helpers';

/** The error that comes from QuickJS. */
export class PlQuickJSError extends Error {
  public stack: string;
  public fullMessage: string;

  constructor(
    quickJSError: Error,
    cause: Error,
  ) {
    super(`PlQuickJSError: ${cause.message}`, { cause });
    this.name = 'PlQuickJSError';

    // QuickJS wraps the error with the name and the message,
    // but we need another format.
    let stack = notEmpty(quickJSError.stack);
    stack = stack.replace(quickJSError.message, '');
    stack = stack.replace(notEmpty(cause.message), '');

    this.stack = stack;

    const causeMsg = 'fullMessage' in cause && typeof cause.fullMessage === 'string'
      ? cause.fullMessage
      : cause.message;

    this.fullMessage = `PlQuickJSError: ${causeMsg}
QuickJS stacktrace:
${this.stack}
`;
  }
}

/**
 * A parsed error from the Pl backend.
 * It contains several suberrors, which could be one or different causes of the error.
 */
export class PlErrorReport extends Error {
  public readonly fullMessage: string;

  constructor(
    /** Full message from the Pl backend. */
    public readonly rawBackendMessage: string,

    /** Either CID conflict or a error from controller. */
    public readonly plErrorType: string,

    /** Parsed pl backend message that will be futher parsed into suberrors. */
    public readonly plMessage: string,

    /** Could be several different errors, the name is from AggregateError. */
    public readonly errors: PlCoreError[],

    /** Optional info about a resource where the error happened. */
    public readonly fieldName?: string,
    public readonly resource?: ResourceId,
    public readonly resourceType?: ResourceType,
  ) {
    const errorMessages = errors.map((e) => e.message).join('\n\n');
    const errorFullMessages = errors.map((e) => e.fullMessage).join('\n\n');

    super(`PlErrorReport: ${errorMessages}`);
    this.name = 'PlErrorReport';

    const rt = this.resourceType ? `${resourceTypeToString(this.resourceType)},` : '';
    const r = this.resource ? resourceIdToString(this.resource) : '';
    const f = this.fieldName ? `/${this.fieldName}` : '';
    const errType = this.plErrorType ? `error type: ${this.plErrorType}` : '';

    this.fullMessage = `PlErrorReport: resource: ${rt} ${r}${f}
${errType}
${errorFullMessages}
`;
  }
}

/**
 * A suberror of a parsed error.
 */
export type PlCoreError =
  | PlInternalError
  | PlTengoError
  | PlRunnerError
  | PlMonetizationError;

/**
 * An general error when we couldn't parse the cause.
 */
export class PlInternalError extends Error {
  public readonly fullMessage: string;
  constructor(
    public readonly message: string,
  ) {
    super(message);
    this.name = 'PlInternalError';
    this.fullMessage = `PlInternalError: ${message}`;
  }
}

/**
 * Happens when workflow template panics.
 */
export class PlTengoError extends Error {
  public readonly fullMessage: string;

  constructor(
    public readonly rawBackendMessage: string,
    public readonly templateName: string,
    public readonly tengoMessage: string,
    public readonly tengoStacktrace: string,
  ) {
    const msg = `PlTengoError:
message:
${tengoMessage}
template: ${templateName}
tengo stacktrace:
${tengoStacktrace}
`;

    super(msg);
    this.name = 'PlTengoError';

    this.fullMessage = `${msg}
raw message:
${this.rawBackendMessage}
`;
  }
}

/**
 * Happens when a command fails to run.
 */
export class PlRunnerError extends Error {
  public readonly fullMessage: string;

  constructor(
    public readonly rawBackendMessage: string,
    public readonly commandName: string,
    public readonly exitCode: number,
    public readonly stdout: string,
    public readonly workingDirectory: string,
  ) {
    const msg = `PlRunnerError:
command: ${commandName}
exit code: ${exitCode}
working directory: ${workingDirectory}
stdout:
${stdout}`;

    super(msg);
    this.name = 'PlRunnerError';
    this.fullMessage = `
${msg}
raw message:
${this.rawBackendMessage}
`;
  }
}

/**
 * Happens when a monetization command fails to run.
 */
export class PlMonetizationError extends PlRunnerError {
  public readonly fullMessage: string;
  constructor(
    rawBackendMessage: string,
    commandName: string,
    exitCode: number,
    stdout: string,
    workingDirectory: string,
  ) {
    super(rawBackendMessage, commandName, exitCode, stdout, workingDirectory);
    const msg = `Monetizaiton error:
${this.stdout}
`;

    this.message = msg;
    this.name = 'PlMonetizationError';

    this.fullMessage = `
${msg}
command: ${this.commandName}
exit code: ${this.exitCode}
working directory: ${this.workingDirectory}

raw message:
${this.rawBackendMessage}
`;
  }
}

/**
 * How the Pl backend represents an error.
 */
const backendErrorSchema = z.object({
  errorType: z.string().default(''),
  message: z.string(),
});

/**
 * Parses a Pl error and suberrors from the Pl backend.
 */
export function parsePlError(
  error: string,
  resource?: ResourceId,
  resourceType?: ResourceType,
  field?: string,
): PlErrorReport {
  const parsed = backendErrorSchema.safeParse(JSON.parse(error));
  if (!parsed.success) {
    throw new Error(`parsePlError: failed to parse the message, got ${error}`);
  }

  const errors = parseSubErrors(parsed.data.message);

  return new PlErrorReport(
    error,
    parsed.data.errorType,
    parsed.data.message,
    errors,

    field,
    resource,
    resourceType,
  );
}

/**
 * Reduces over the lines of the pl error message
 * to extract messages, and categorizes them.
 */
export function parseSubErrors(message: string): PlCoreError[] {
  // the state of this reducing function
  const state = {
    stage: 'initial' as 'initial' | 'path' | 'message',
    value: [] as string[],
    result: [] as PlCoreError[],
  };

  for (const line of message.split('\n')) {
    if (state.stage == 'initial') {
      // we need initial stage because apparently the first line
      // of the error doesn't have [I], but is a path line.
      state.stage = 'path';
    } else if (state.stage == 'path' && !isPath(line)) {
      state.stage = 'message';
    } else if (state.stage == 'message' && isPath(line)) {
      state.stage = 'path';
      const text = state.value.join('\n');
      state.result.push(parseCoreError(text));
      state.value = [];
    }

    state.value.push(line);
  }

  const text = state.value.join('\n');
  state.result.push(parseCoreError(text));

  return state.result;
}

function isPath(line: string): boolean {
  for (const fieldType of ['U', 'I', 'O', 'S', 'OTW', 'D', 'MTW']) {
    if (line.startsWith(`[${fieldType}]`))
      return true;
  }

  return false;
}

/**
 * Parses a suberror from the Pl backend.
 */
function parseCoreError(message: string): PlCoreError {
  // trying to parse a runner or monetization error.
  // https://regex101.com/r/tmKLj7/1
  const runnerErrorRegex = /working directory: "(.*)"[\s\S]failed to run command: "([^"]+)" exited with code (\d+)\.[\s\S]*?Here is the latest command output:[\s\S]*?\t([\s\S]*)/;
  const match = message.match(runnerErrorRegex);
  if (match) {
    const workingDirectory = match[1];
    const command = match[2];
    const exitCode = parseInt(match[3], 10);
    const stdout = match[4].trim();

    if (command.endsWith(`mnz-client`) && exitCode == 1) {
      return new PlMonetizationError(message, command, exitCode, stdout, workingDirectory);
    }

    return new PlRunnerError(message, command, exitCode, stdout, workingDirectory);
  }

  // trying to parse a Tengo error.
  // https://regex101.com/r/1a7RpO/1
  const workflowErrorRegex = /cannot eval code: cannot eval template: template: (.+)\n\t(.*?)\n\t(at [\s\S]*)/;
  const workflowMatch = message.match(workflowErrorRegex);
  if (workflowMatch) {
    const templateName = workflowMatch[1];
    const errorMessage = workflowMatch[2];
    const stackTrace = workflowMatch[3];

    return new PlTengoError(message, templateName, errorMessage, stackTrace);
  }

  // if we couldn't parse the error, return a general error.
  return new PlInternalError(message);
}
