import { ResourceId, resourceIdFromString, stringifyWithResourceId } from "@milaboratories/pl-client";
import { parsePlError, parseSubErrors, PlMonetizationError, PlErrorReport, PlRunnerError, PlTengoError } from './parsed_error';
import { describe, test, it, expect } from 'vitest';
import { ensureErrorLike } from "@milaboratories/pl-error-like";

const runnerError = '{"errorType":"","message":"\\"NG:0x2331A5\\" has 1 input errors:\\n[I] \\"NG:0x2331A5/blob\\": \\"NG:0x2331A4\\" has 1 input errors:\\n[I] \\"NG:0x2331A4/resource\\": \\"NG:0x2331CD\\" has 1 input errors:\\n[I] \\"NG:0x2331CD/resource\\": \\"NG:0x2331CA\\" has 1 input errors:\\n[I] \\"NG:0x2331CA/inputs\\": \\"NG:0x2331CB\\" has 1 input errors:\\n[I] \\"NG:0x2331CB/workdir\\": working directory: \\"workdirs/0x2331E0\\"\\nfailed to run command: \\"java\\" exited with code 22.\\nHere is the latest command output:\\n\\tLicense manager thread died.\\n\\t=== No License ===\\n\\t\\n\\tTo use MiXCR, please, provide a valid license.\\n\\t\\n\\tIf you already have a license, activate it by calling:\\n\\t  mixcr activate-license\\n\\t\\n\\t\\n"}'

const tengoError = "{\"errorType\":\"\",\"message\":\"\\\"NG:0x16A\\\" has 1 input errors:\\n[I] \\\"NG:0x16A/resource\\\": cannot eval code: cannot eval template: template: @platforma-open/milaboratories.samples-and-data.workflow:main@1.10.0\\n\\tRuntime Error: File handle not set for \\\"R1\\\" in sample \\\"S63UG7K2IRZSSMAI4UVB5CNJ\\\"\\n\\tat @platforma-sdk/workflow-tengo:ll:25:1\\n\\tat @platforma-open/milaboratories.samples-and-data.workflow:main:205:7\\n\\tat @platforma-sdk/workflow-tengo:workflow:264:11\\n\\tat @platforma-sdk/workflow-tengo:tpl:470:11\\n\\tat @platforma-sdk/workflow-tengo:tpl:373:1\\n\\tat @platforma-sdk/workflow-tengo:workflow:261:1\\n\\tat @platforma-open/milaboratories.samples-and-data.workflow:main:35:1\"}"

const tengoErrorNoErrorType = "{\"message\":\"\\\"NG:0x16A\\\" has 1 input errors:\\n[I] \\\"NG:0x16A/resource\\\": cannot eval code: cannot eval template: template: @platforma-open/milaboratories.samples-and-data.workflow:main@1.10.0\\n\\tRuntime Error: File handle not set for \\\"R1\\\" in sample \\\"S63UG7K2IRZSSMAI4UVB5CNJ\\\"\\n\\tat @platforma-sdk/workflow-tengo:ll:25:1\\n\\tat @platforma-open/milaboratories.samples-and-data.workflow:main:205:7\\n\\tat @platforma-sdk/workflow-tengo:workflow:264:11\\n\\tat @platforma-sdk/workflow-tengo:tpl:470:11\\n\\tat @platforma-sdk/workflow-tengo:tpl:373:1\\n\\tat @platforma-sdk/workflow-tengo:workflow:261:1\\n\\tat @platforma-open/milaboratories.samples-and-data.workflow:main:35:1\"}"

const monetizationSubErrors = `"NG:0x1F94C0" has 1 input errors:
[I] "NG:0x1F94C0/resource": "NG:0x1F94FA" has 1 input errors:
[I] "NG:0x1F94FA/resource": "NG:0x1F94F5" has 1 input errors:
[I] "NG:0x1F94F5/inputs": "NG:0x1F94F6" has 1 input errors:
[I] "NG:0x1F94F6/workdir": "NG:0x1F94F0" has 2 input errors:
[I] "NG:0x1F94F0/refs": "NG:0x1F94F1" has 1 input errors:
[I] "NG:0x1F94F1/monetization": "NG:0x1F94EE" has 1 input errors:
[I] "NG:0x1F94EE/resource": "NG:0x1F94EC" has 1 input errors:
[I] "NG:0x1F94EC/inputs": "NG:0x1F94ED" has 1 input errors:
---
[I] "NG:0x1F94ED/resource": "NG:0x1F94EB" has 1 input errors:
[I] "NG:0x1F94EB/resource": "NG:0x1F94E6" has 1 input errors:
[I] "NG:0x1F94E6/resource": "NG:0x1F94E2" has 1 input errors:
[I] "NG:0x1F94E2/inputs": "NG:0x1F94E3" has 1 input errors:
[I] "NG:0x1F94E3/workdir": working directory: "workdirs/0x1F9514"
failed to run command: "/home/snyssfx/PlatformaDev/local/packages/installed/platforma-open/platforma-open/milaboratories.software-small-binaries.mnz-client/main/1.5.9-linux-x64.0x1F1A04/mnz-client" exited with code 1.
Here is the latest command output:
	2025/03/13 17:25:18 get API error: VALIDATION_ERR Invalid /mnz/run-spec body: field productKey -> Invalid product key
[I] "NG:0x1F94F0/workdirIn": "NG:0x1F94E9" has 1 input errors:
[O] "NG:0x1F94E9/resource": "NG:0x1F94E2" has 1 input errors:
[U] "NG:0x1F94E2/inputs": "NG:0x1F94E3" has 1 input errors:
[MTW] "NG:0x1F94E3/workdir": working directory: "workdirs/0x1F9514"
failed to run command: "/home/snyssfx/PlatformaDev/local/packages/installed/platforma-open/platforma-open/milaboratories.software-small-binaries.mnz-client/main/1.5.9-linux-x64.0x1F1A04/mnz-client" exited with code 1.
Here is the latest command output:
	2025/03/13 17:25:18 get API error: VALIDATION_ERR Invalid /mnz/run-spec body: field productKey -> Invalid product key`

describe('parsePlError', () => {
  it('should parse runner error correctly', () => {
    const result = parsePlError(runnerError, resourceIdFromString('NG:0x2331A5')! as ResourceId, { name: 'RunCommand', version: "1" }, 'fieldName',);

    expect(result).toBeInstanceOf(PlErrorReport);
    expect(result.name).toBe('PlErrorReport');
    expect(result.plErrorType).toBe('');
    expect(result.fieldName).toBe('fieldName');
    expect(stringifyWithResourceId(result.resource)).toBe('\"NG:0x2331a5\"');

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toBeInstanceOf(PlRunnerError);
    expect((result.errors[0] as PlRunnerError).commandName).toBe('java');
    expect((result.errors[0] as PlRunnerError).exitCode).toBe(22);
    expect((result.errors[0] as PlRunnerError).stdout).toBeDefined();
    expect((result.errors[0] as PlRunnerError).workingDirectory).toBe('workdirs/0x2331E0');

    expect((result.errors[0]).message).toBe(`PlRunnerError:
command: java
exit code: 22
working directory: workdirs/0x2331E0
stdout:
License manager thread died.
	=== No License ===
	
	To use MiXCR, please, provide a valid license.
	
	If you already have a license, activate it by calling:
	  mixcr activate-license`);
  });

  it('should parse workflow error correctly', () => {
    const result = parsePlError(tengoError, resourceIdFromString('NG:0x16A')! as ResourceId, { name: 'RunCommand', version: "1" }, 'fieldName');

    expect(result).toBeInstanceOf(PlErrorReport);
    expect(result.name).toBe('PlErrorReport');
    expect(result.plErrorType).toBe('');
    expect(result.fieldName).toBe('fieldName');
    expect(stringifyWithResourceId(result.resource)).toBe('\"NG:0x16a\"');

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toBeInstanceOf(PlTengoError);
    expect((result.errors[0] as PlTengoError).templateName).toBe('@platforma-open/milaboratories.samples-and-data.workflow:main@1.10.0');
    expect((result.errors[0] as PlTengoError).tengoMessage).toBe('Runtime Error: File handle not set for "R1" in sample "S63UG7K2IRZSSMAI4UVB5CNJ"');

    expect((result.errors[0]).message).toBe(`PlTengoError:
message:
Runtime Error: File handle not set for "R1" in sample "S63UG7K2IRZSSMAI4UVB5CNJ"
template: @platforma-open/milaboratories.samples-and-data.workflow:main@1.10.0
tengo stacktrace:
at @platforma-sdk/workflow-tengo:ll:25:1
	at @platforma-open/milaboratories.samples-and-data.workflow:main:205:7
	at @platforma-sdk/workflow-tengo:workflow:264:11
	at @platforma-sdk/workflow-tengo:tpl:470:11
	at @platforma-sdk/workflow-tengo:tpl:373:1
	at @platforma-sdk/workflow-tengo:workflow:261:1
	at @platforma-open/milaboratories.samples-and-data.workflow:main:35:1
`);
  });

  it('should parse workflow error correctly even without the error type', () => {
    const result = parsePlError(tengoErrorNoErrorType, resourceIdFromString('NG:0x16A')! as ResourceId, { name: 'RunCommand', version: "1" }, 'fieldName');

    expect(result).toBeInstanceOf(PlErrorReport);
    expect(result.name).toBe('PlErrorReport');
    expect(result.plErrorType).toBe('');

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toBeInstanceOf(PlTengoError);
  });

  it('should parse monetization sub errors correctly', () => {
    const result = parseSubErrors(monetizationSubErrors);

    expect(result.length).toBe(2);

    expect(result[0]).toBeInstanceOf(PlMonetizationError);
    expect((result[0] as PlMonetizationError).commandName).toContain('mnz-client');
    expect((result[0] as PlMonetizationError).exitCode).toBe(1);
    expect((result[0] as PlMonetizationError).stdout).toBeDefined();
    expect((result[0] as PlMonetizationError).workingDirectory).toBe('workdirs/0x1F9514');

    expect(result[1]).toBeInstanceOf(PlMonetizationError);
    expect((result[1] as PlMonetizationError).commandName).toContain('mnz-client');
    expect((result[1] as PlMonetizationError).exitCode).toBe(1);
    expect((result[1] as PlMonetizationError).stdout).toBeDefined();
    expect((result[1] as PlMonetizationError).workingDirectory).toBe('workdirs/0x1F9514');

    expect((result[1]).message).toBe(`Monetizaiton error:
2025/03/13 17:25:18 get API error: VALIDATION_ERR Invalid /mnz/run-spec body: field productKey -> Invalid product key
`);
  });
});

test('pl error report has error like shape', () => {
  const plErrorReport = new PlErrorReport('test error report', '', '', []);

  const got = ensureErrorLike(plErrorReport);

  expect(got).toBeDefined();
});
