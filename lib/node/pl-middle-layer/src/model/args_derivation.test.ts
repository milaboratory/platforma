import type { ArgsIssue } from "@milaboratories/pl-model-common";
import type { BlockConfig } from "@platforma-sdk/model";
import { BlockStorageFacadeCallbacks } from "@platforma-sdk/model";
import { canonicalJsonBytes } from "@milaboratories/ts-helpers";
import { getQuickJS } from "quickjs-emscripten";
import { beforeAll, describe, expect, test } from "vitest";
import {
  argsFingerprint,
  derivedArgsValue,
  parseArgsDeriveResult,
  readArgsErrorsField,
  argsErrorsFieldChange,
  argsErrorsOfBlock,
  type DerivedArgs,
  type ArgsErrorsRecord,
} from "./args_derivation";
import { ProjectHelper } from "./project_helper";

let helper: ProjectHelper;

beforeAll(async () => {
  helper = new ProjectHelper(await getQuickJS());
});

const missingThreshold: ArgsIssue = { severity: "error", message: "Set a threshold" };
const fewSamples: ArgsIssue = { severity: "warning", message: "Only two samples" };

describe("parseArgsDeriveResult", () => {
  test("reads the results of a model without args issues as before", () => {
    expect(parseArgsDeriveResult({ value: { n: 1 } })).toEqual({
      type: "runnable",
      args: { n: 1 },
    });
    expect(parseArgsDeriveResult({ error: "args() threw: no input" })).toEqual({
      type: "absent",
      error: new Error("args() threw: no input"),
    });
  });

  test("args that are undefined are no args", () => {
    expect(parseArgsDeriveResult({ value: undefined })).toMatchObject({ type: "absent" });
    expect(parseArgsDeriveResult({})).toMatchObject({ type: "absent" });
    expect(
      parseArgsDeriveResult({ error: "Set a threshold", issues: [missingThreshold] }),
    ).toMatchObject({ type: "absent" });
  });

  test("warnings leave the args runnable", () => {
    expect(parseArgsDeriveResult({ value: { n: 1 }, issues: [fewSamples] })).toEqual({
      type: "runnable",
      args: { n: 1 },
    });
  });

  test("errors of argsIssues block the args, warnings are left out", () => {
    expect(
      parseArgsDeriveResult({
        error: "Set a threshold",
        args: { n: 1 },
        issues: [fewSamples, missingThreshold],
      }),
    ).toEqual({ type: "blocked", args: { n: 1 }, errors: [missingThreshold] });
  });

  test("a severity other than warning is an error", () => {
    expect(
      parseArgsDeriveResult({
        error: "Set a threshold",
        args: {},
        issues: [{ severity: "fatal", message: "Set a threshold" }],
      }),
    ).toEqual({ type: "blocked", args: {}, errors: [missingThreshold] });
  });

  test("issues that cannot be read, or hold no error, give way to the reported error", () => {
    const reported: ArgsIssue = { severity: "error", message: "Set a threshold; Pick a column" };
    expect(
      parseArgsDeriveResult({ error: reported.message, args: {}, issues: "not a list" }),
    ).toEqual({ type: "blocked", args: {}, errors: [reported] });
    expect(parseArgsDeriveResult({ error: reported.message, args: {} })).toEqual({
      type: "blocked",
      args: {},
      errors: [reported],
    });
    expect(
      parseArgsDeriveResult({ error: reported.message, args: {}, issues: [fewSamples] }),
    ).toEqual({ type: "blocked", args: {}, errors: [reported] });
  });

  test("refuses a result that is not an object, or whose error is not a string", () => {
    expect(() => parseArgsDeriveResult(undefined)).toThrow();
    expect(() => parseArgsDeriveResult("args")).toThrow();
    expect(() => parseArgsDeriveResult({ error: 42 })).toThrow();
  });
});

describe("derivedArgsValue", () => {
  test("gives the args of runnable and blocked derivations, nothing for absent ones", () => {
    expect(derivedArgsValue(runnable({ n: 1 }))).toEqual({ n: 1 });
    expect(derivedArgsValue(blocked({ n: 2 }, [missingThreshold]))).toEqual({ n: 2 });
    expect(derivedArgsValue(absent())).toBeUndefined();
  });
});

describe("argsFingerprint", () => {
  test("is the same for args that encode to the same JSON, whatever the key order", () => {
    expect(argsFingerprint({ a: 1, b: { c: [1, 2], d: "x" } })).toBe(
      argsFingerprint(JSON.parse('{ "b": { "d": "x", "c": [1, 2] }, "a": 1 }')),
    );
    expect(argsFingerprint({ a: 1, skipped: undefined })).toBe(argsFingerprint({ a: 1 }));
  });

  test("differs for args with other content", () => {
    expect(argsFingerprint({ a: 1 })).not.toBe(argsFingerprint({ a: 2 }));
    expect(argsFingerprint({ a: [1, 2] })).not.toBe(argsFingerprint({ a: [2, 1] }));
  });
});

describe("argsErrorsFieldChange", () => {
  test("writes the errors of blocked args, with the fingerprint of the args, into a field not there yet", () => {
    expect(argsErrorsFieldChange(undefined, blocked({ n: 1 }, [missingThreshold]))).toEqual({
      type: "write",
      data: recordBytes({ n: 1 }, [missingThreshold]),
    });
  });

  test("writes a record with no errors for args that may run", () => {
    expect(argsErrorsFieldChange(undefined, runnable({ n: 1 }))).toEqual({
      type: "write",
      data: recordBytes({ n: 1 }, []),
    });
    const current = { value: recordBytes({ n: 1 }, [missingThreshold]) };
    expect(argsErrorsFieldChange(current, runnable({ n: 1 }))).toEqual({
      type: "write",
      data: recordBytes({ n: 1 }, []),
    });
  });

  test("keeps a field that already holds the same errors for the same args", () => {
    const current = { value: recordBytes({ n: 3 }, [missingThreshold]) };
    expect(argsErrorsFieldChange(current, blocked({ n: 3 }, [missingThreshold]))).toEqual({
      type: "keep",
    });
    const noErrors = { value: recordBytes({ n: 3 }, []) };
    expect(argsErrorsFieldChange(noErrors, runnable({ n: 3 }))).toEqual({ type: "keep" });
  });

  test("rewrites a field holding other errors", () => {
    const pickColumn: ArgsIssue = { severity: "error", message: "Pick a column" };
    const current = { value: recordBytes({}, [missingThreshold]) };
    expect(argsErrorsFieldChange(current, blocked({}, [pickColumn]))).toEqual({
      type: "write",
      data: recordBytes({}, [pickColumn]),
    });
  });

  test("rewrites a field holding the same errors found in other args", () => {
    const current = { value: recordBytes({ n: 1 }, [missingThreshold]) };
    expect(argsErrorsFieldChange(current, blocked({ n: 2 }, [missingThreshold]))).toEqual({
      type: "write",
      data: recordBytes({ n: 2 }, [missingThreshold]),
    });
  });

  test("deletes the field once there are no args, and never creates it for none", () => {
    const current = { value: recordBytes({}, [missingThreshold]) };
    expect(argsErrorsFieldChange(current, absent())).toEqual({ type: "delete" });
    expect(argsErrorsFieldChange(undefined, absent())).toEqual({ type: "keep" });
  });
});

describe("readArgsErrorsField", () => {
  test("reads the errors the field was written with, for the args they were found in", () => {
    const change = argsErrorsFieldChange(undefined, blocked({ n: 1 }, [missingThreshold]));
    if (change.type !== "write") throw new Error(`expected a write, got ${change.type}`);
    expect(readArgsErrorsField(change.data, { n: 1 })).toEqual([missingThreshold]);
    // Current args are read back from their field, which need not be canonical JSON.
    expect(readArgsErrorsField(change.data, JSON.parse('{ "n": 1 }'))).toEqual([missingThreshold]);
  });

  test("reads a record with no errors as none", () => {
    expect(readArgsErrorsField(recordBytes({ n: 1 }, []), { n: 1 })).toEqual([]);
    // Warnings are not errors.
    expect(readArgsErrorsField(recordBytes({ n: 1 }, [fewSamples]), { n: 1 })).toEqual([]);
  });

  test("a record written for other args, as a middle layer unaware of the field leaves it, records none", () => {
    expect(readArgsErrorsField(recordBytes({ n: 1 }, [missingThreshold]), { n: 2 })).toEqual([]);
  });

  test("no record records none, as for args written before the record existed", () => {
    expect(readArgsErrorsField(undefined, { n: 1 })).toEqual([]);
  });

  test("holds no errors while the block has no current args", () => {
    expect(readArgsErrorsField(recordBytes({ n: 1 }, [missingThreshold]), undefined)).toEqual([]);
    expect(readArgsErrorsField(undefined, undefined)).toEqual([]);
  });

  test("a field that cannot be read records none", () => {
    const unreadable = [
      Buffer.from("{"),
      Buffer.from("true"),
      canonicalJsonBytes([missingThreshold]),
      canonicalJsonBytes({ errors: [missingThreshold] }),
      canonicalJsonBytes({ argsFingerprint: argsFingerprint({ n: 1 }) }),
    ];
    for (const data of unreadable) {
      expect(readArgsErrorsField(data, { n: 1 })).toEqual([]);
    }
  });
});

describe("argsErrorsOfBlock", () => {
  const inputsValid = { value: recordBytes({ n: 1 }, [missingThreshold]) };

  test("gives the errors of a block with model API version 2 for its current args", () => {
    expect(argsErrorsOfBlock({ modelAPIVersion: 2, inputsValid, currentArgs: { n: 1 } })).toEqual([
      missingThreshold,
    ]);
  });

  test("a block whose record was written for other args, or that has none, has none", () => {
    expect(argsErrorsOfBlock({ modelAPIVersion: 2, inputsValid, currentArgs: { n: 2 } })).toEqual(
      [],
    );
    expect(
      argsErrorsOfBlock({ modelAPIVersion: 2, inputsValid: undefined, currentArgs: { n: 1 } }),
    ).toEqual([]);
  });

  test("ignores a field left over for a block whose model is not on model API version 2", () => {
    expect(argsErrorsOfBlock({ modelAPIVersion: 1, inputsValid, currentArgs: { n: 1 } })).toEqual(
      [],
    );
    expect(
      argsErrorsOfBlock({ modelAPIVersion: undefined, inputsValid, currentArgs: { n: 1 } }),
    ).toEqual([]);
  });
});

describe("ProjectHelper.deriveArgsFromStorage", () => {
  test("a model without args issues whose args() throws has no args and no args errors", () => {
    // What the SDK's __pl_args_derive returned before args issues, and still returns for a
    // block that declares no argsIssues.
    const derived = helper.deriveArgsFromStorage(
      configWith('() => ({ error: "args() threw: Select a dataset" })'),
      "{}",
    );

    expect(derived).toEqual({ type: "absent", error: new Error("args() threw: Select a dataset") });
    expect(argsErrorsFieldChange(undefined, derived)).toEqual({ type: "keep" });
  });

  test("a model without args issues whose args() succeeds has runnable args", () => {
    const derived = helper.deriveArgsFromStorage(configWith("() => ({ value: { n: 1 } })"), "{}");

    expect(derived).toEqual({ type: "runnable", args: { n: 1 } });
    expect(argsErrorsFieldChange(undefined, derived)).toEqual({
      type: "write",
      data: recordBytes({ n: 1 }, []),
    });
  });

  test("argsIssues that found errors block the args they were given", () => {
    const derived = helper.deriveArgsFromStorage(
      configWith(
        "(storageJson) => ({ error: 'Set a threshold', args: JSON.parse(storageJson), " +
          "issues: [{ severity: 'warning', message: 'Only two samples' }, " +
          "{ severity: 'error', message: 'Set a threshold' }] })",
      ),
      JSON.stringify({ n: 5 }),
    );

    expect(derived).toEqual({ type: "blocked", args: { n: 5 }, errors: [missingThreshold] });
  });

  test("a model that fails, or returns something unreadable, gives no args", () => {
    expect(
      helper.deriveArgsFromStorage(configWith("() => { throw new Error('boom'); }"), "{}"),
    ).toMatchObject({ type: "absent" });
    expect(helper.deriveArgsFromStorage(configWith("() => 42"), "{}")).toMatchObject({
      type: "absent",
    });
  });
});

// Internals

function runnable(args: unknown): DerivedArgs {
  return { type: "runnable", args };
}

function blocked(args: unknown, errors: ArgsIssue[]): DerivedArgs {
  return { type: "blocked", args, errors };
}

function recordBytes(args: unknown, errors: ArgsIssue[]): Uint8Array {
  const record: ArgsErrorsRecord = { argsFingerprint: argsFingerprint(args), errors };
  return canonicalJsonBytes(record);
}

function absent(): DerivedArgs {
  return { type: "absent", error: new Error("args() threw: no input") };
}

/**
 * A block config whose model code registers `body` as its __pl_args_derive callback, the way the
 * SDK registers callbacks inside a real bundle.
 */
function configWith(body: string): BlockConfig {
  const handle = BlockStorageFacadeCallbacks.ArgsDerive;
  return {
    configVersion: 4,
    modelAPIVersion: 2,
    sdkVersion: "1.0.0",
    renderingMode: "Heavy",
    sections: { __renderLambda: true, handle: "sections" },
    outputs: {},
    code: {
      type: "plain",
      content: `globalThis.cfgRenderCtx.callbackRegistry[${JSON.stringify(handle)}] = ${body};`,
    },
    blockLifecycleCallbacks: { [handle]: { __renderLambda: true, handle } },
  };
}
