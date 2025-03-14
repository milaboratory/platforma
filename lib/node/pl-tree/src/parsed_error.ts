/** Pl Backend throws arbitrary errors, and we're trying to parse them here. */

import { z } from "zod";
import { ResourceId, resourceIdToString, ResourceType, resourceTypeToString } from "@milaboratories/pl-client";

export class PlParsedError extends Error {
  constructor(
    public readonly fullMessage: string,
    public readonly plErrorType: string,
    public readonly plMessage: string,
    public readonly subErrors: PlSubError[],

    public readonly fieldName?: string,
    public readonly resource?: ResourceId,
    public readonly resourceType?: ResourceType,
  ) {
    super(fullMessage);
    this.name = "PlParsedError";
    this.message = this.toString();
  }

  toString() {
    const rt = this.resourceType ? `${resourceTypeToString(this.resourceType)},` : '';
    const r = this.resource ? resourceIdToString(this.resource) : '';
    const f = this.fieldName ? `/${this.fieldName}` : '';
    const errType = this.plErrorType ? `error type: ${this.plErrorType}` : '';
    const subErrors = this.subErrors.map(e => e.message).join('\n\n');

    return `ParsedPlError: resource: ${rt} ${r}${f}
${errType}
${subErrors}`;
  }
}

export type PlSubError =
  | PlGeneralError
  | PlWorkflowError
  | PlRunnerError;

export class PlGeneralError extends Error {
  constructor(
    message: string,
  ) {
    super(message);
    this.name = "PlGeneralError";
  }
}

export class PlWorkflowError extends PlGeneralError {
  constructor(
    public readonly fullMessage: string,
    public readonly templateName: string,
    public readonly tengoMessage: string,
    public readonly tengoStacktrace: string,
  ) {
    super(fullMessage);
    this.name = "PlWorkflowError";
    this.message = this.toString();
  }

  toString() {
    return `PlWorkflowError:
template: ${this.templateName}
message:
${this.tengoMessage}
tengo stacktrace:
${this.tengoStacktrace}

full message:
${this.fullMessage}`;
  }
}

export class PlRunnerError extends PlGeneralError {
  constructor(
    public readonly fullMessage: string,
    public readonly commandName: string,
    public readonly exitCode: number,
    public readonly stdout: string,
  ) {
    super(fullMessage);
    this.name = "PlRunnerError";
    this.message = this.toString();
  }

  toString() {
    return `PlRunnerError:
command: ${this.commandName}
exit code: ${this.exitCode}
stdout:
${this.stdout}

full message:
${this.fullMessage}`;
  }
}

export class PlMonetizationError extends PlRunnerError {
  constructor(
    fullMessage: string,
    commandName: string,
    exitCode: number,
    stdout: string,
  ) {
    super(fullMessage, commandName, exitCode, stdout);
    this.name = "PlMonetizationError";
    this.message = this.toString();
  }

  toString() {
    return `PlMonetizationError:
command: ${this.commandName}
exit code: ${this.exitCode}
stdout:
${this.stdout}

full message:
${this.fullMessage}`;
  }
}

const backendErrorSchema = z.object({
  errorType: z.string(),
  message: z.string(),
})

export function parsePlError(
  error: string,

  resource?: ResourceId,
  resourceType?: ResourceType,
  field?: string,
): PlParsedError {
  const parsed = backendErrorSchema.parse(JSON.parse(error));
  return new PlParsedError(
    error,
    parsed.errorType,
    parsed.message,
    parseSubErrors(parsed.message),

    field,
    resource,
    resourceType,
  )
}

/** Reduces over the lines of the pl error message to extract paths and messages. */
export function parseSubErrors(message: string): PlSubError[] {
  const result: PlSubError[] = [];

  const state = {
    stage: 'initial', // initial, path, message
    value: [] as string[],
  };

  for (const line of message.split('\n')) {
    if (state.stage == 'initial') {
      state.stage = 'path';
    } else if (state.stage == 'path' && !line.startsWith('[I]')) {
      state.stage = 'message';
    } else if (state.stage == 'message' && line.startsWith('[I]')) {
      state.stage = 'path';
      const text = state.value.join("\n");
      result.push(parseSubError(text));
      state.value = [];
    }

    state.value.push(line);
  }

  const text = state.value.join('\n');
  result.push(parseSubError(text));

  return result;
}

function parseSubError(message: string): PlSubError {
  const runnerErrorRegex = /failed to run command: "([^"]+)" exited with code (\d+)\.[\s\S]*?Here is the latest command output:[\s\S]*?\t([\s\S]*)/;
  const match = message.match(runnerErrorRegex);
  if (match) {
    const command = match[1];
    const exitCode = parseInt(match[2], 10);
    const stdout = match[3].trim();

    if (command.endsWith(`mnz-client`) && exitCode == 1) {
      return new PlMonetizationError(message, command, exitCode, stdout);
    }

    return new PlRunnerError(message, command, exitCode, stdout);
  }

  // https://regex101.com/r/1a7RpO/1
  const workflowErrorRegex = /cannot eval code: cannot eval template: template: (.+)\n\t(.*?)\n\t(at [\s\S]*)/;
  const workflowMatch = message.match(workflowErrorRegex);
  if (workflowMatch) {
    const templateName = workflowMatch[1];
    const errorMessage = workflowMatch[2];
    const stackTrace = workflowMatch[3];

    return new PlWorkflowError(message, templateName, errorMessage, stackTrace);
  }

  return new PlGeneralError(message);
}
