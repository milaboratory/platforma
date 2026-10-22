import type { RunIssue } from "@milaboratories/pl-model-common";
import type { BlockConfig } from "@platforma-sdk/model";
import { BlockStorageFacadeCallbacks } from "@platforma-sdk/model";
import { canonicalJsonBytes } from "@milaboratories/ts-helpers";
import { getQuickJS } from "quickjs-emscripten";
import { beforeAll, describe, expect, test } from "vitest";
import {
  argsFingerprint,
  argsRepair,
  currentArgsChange,
  derivedArgsValue,
  parseArgsDeriveResult,
  readRunErrorsField,
  runErrorsAllowRun,
  runErrorsFieldChange,
  runErrorsOfBlock,
  type DerivedArgs,
  type RunErrorsRecord,
  type RunErrorsState,
} from "./args_derivation";
import { ProjectHelper } from "./project_helper";

let helper: ProjectHelper;

beforeAll(async () => {
  helper = new ProjectHelper(await getQuickJS());
});

const missingThreshold: RunIssue = { severity: "error", message: "Set a threshold" };
const fewSamples: RunIssue = { severity: "warning", message: "Only two samples" };

describe("parseArgsDeriveResult", () => {
  test("reads the results of a model without run issues as before", () => {
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

  test("errors of runIssues block the args, warnings are left out", () => {
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
    const reported: RunIssue = { severity: "error", message: "Set a threshold; Pick a column" };
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

describe("runErrorsFieldChange", () => {
  test("writes the errors of blocked args, with the fingerprint of the args, into a field not there yet", () => {
    expect(runErrorsFieldChange(undefined, blocked({ n: 1 }, [missingThreshold]))).toEqual({
      type: "write",
      data: recordBytes({ n: 1 }, [missingThreshold]),
    });
  });

  test("writes a record with no errors for args that may run", () => {
    expect(runErrorsFieldChange(undefined, runnable({ n: 1 }))).toEqual({
      type: "write",
      data: recordBytes({ n: 1 }, []),
    });
    const current = { value: recordBytes({ n: 1 }, [missingThreshold]) };
    expect(runErrorsFieldChange(current, runnable({ n: 1 }))).toEqual({
      type: "write",
      data: recordBytes({ n: 1 }, []),
    });
  });

  test("keeps a field that already holds the same errors for the same args", () => {
    const current = { value: recordBytes({ n: 3 }, [missingThreshold]) };
    expect(runErrorsFieldChange(current, blocked({ n: 3 }, [missingThreshold]))).toEqual({
      type: "keep",
    });
    const noErrors = { value: recordBytes({ n: 3 }, []) };
    expect(runErrorsFieldChange(noErrors, runnable({ n: 3 }))).toEqual({ type: "keep" });
  });

  test("rewrites a field holding other errors", () => {
    const pickColumn: RunIssue = { severity: "error", message: "Pick a column" };
    const current = { value: recordBytes({}, [missingThreshold]) };
    expect(runErrorsFieldChange(current, blocked({}, [pickColumn]))).toEqual({
      type: "write",
      data: recordBytes({}, [pickColumn]),
    });
  });

  test("rewrites a field holding the same errors found in other args", () => {
    const current = { value: recordBytes({ n: 1 }, [missingThreshold]) };
    expect(runErrorsFieldChange(current, blocked({ n: 2 }, [missingThreshold]))).toEqual({
      type: "write",
      data: recordBytes({ n: 2 }, [missingThreshold]),
    });
  });

  test("deletes the field once there are no args, and never creates it for none", () => {
    const current = { value: recordBytes({}, [missingThreshold]) };
    expect(runErrorsFieldChange(current, absent())).toEqual({ type: "delete" });
    expect(runErrorsFieldChange(undefined, absent())).toEqual({ type: "keep" });
  });
});

describe("readRunErrorsField", () => {
  test("reads the errors the field was written with, for the args they were found in", () => {
    const change = runErrorsFieldChange(undefined, blocked({ n: 1 }, [missingThreshold]));
    if (change.type !== "write") throw new Error(`expected a write, got ${change.type}`);
    expect(readRunErrorsField(change.data, { n: 1 })).toEqual(known([missingThreshold]));
    // Current args are read back from their field, which need not be canonical JSON.
    expect(readRunErrorsField(change.data, JSON.parse('{ "n": 1 }'))).toEqual(
      known([missingThreshold]),
    );
  });

  test("reads a record with no errors as known to have none", () => {
    expect(readRunErrorsField(recordBytes({ n: 1 }, []), { n: 1 })).toEqual(known([]));
    // Warnings are not errors.
    expect(readRunErrorsField(recordBytes({ n: 1 }, [fewSamples]), { n: 1 })).toEqual(known([]));
  });

  test("errors of other current args, which a middle layer unaware of the field wrote, are unknown", () => {
    expect(readRunErrorsField(recordBytes({ n: 1 }, [missingThreshold]), { n: 2 })).toEqual(
      UNKNOWN,
    );
    expect(readRunErrorsField(recordBytes({ n: 1 }, []), { n: 2 })).toEqual(UNKNOWN);
  });

  test("errors are unknown without the record", () => {
    expect(readRunErrorsField(undefined, { n: 1 })).toEqual(UNKNOWN);
  });

  test("holds no errors while the block has no current args", () => {
    expect(readRunErrorsField(recordBytes({ n: 1 }, [missingThreshold]), undefined)).toEqual(
      known([]),
    );
    expect(readRunErrorsField(undefined, undefined)).toEqual(known([]));
  });

  test("errors in a field that cannot be read are unknown", () => {
    const unreadable = [
      Buffer.from("{"),
      Buffer.from("true"),
      canonicalJsonBytes([missingThreshold]),
      canonicalJsonBytes({ errors: [missingThreshold] }),
      canonicalJsonBytes({ argsFingerprint: argsFingerprint({ n: 1 }) }),
    ];
    for (const data of unreadable) {
      expect(readRunErrorsField(data, { n: 1 })).toEqual(UNKNOWN);
    }
  });
});

describe("runErrorsOfBlock", () => {
  const inputsValid = { value: recordBytes({ n: 1 }, [missingThreshold]) };

  test("gives the errors of a block with model API version 2 for its current args", () => {
    expect(runErrorsOfBlock({ modelAPIVersion: 2, inputsValid, currentArgs: { n: 1 } })).toEqual(
      known([missingThreshold]),
    );
  });

  test("errors of a block with a foreign fingerprint are unknown", () => {
    expect(runErrorsOfBlock({ modelAPIVersion: 2, inputsValid, currentArgs: { n: 2 } })).toEqual(
      UNKNOWN,
    );
  });

  test("errors of a block with current args and no field are unknown", () => {
    expect(
      runErrorsOfBlock({ modelAPIVersion: 2, inputsValid: undefined, currentArgs: { n: 1 } }),
    ).toEqual(UNKNOWN);
  });

  test("a block without current args has none", () => {
    expect(
      runErrorsOfBlock({ modelAPIVersion: 2, inputsValid: undefined, currentArgs: undefined }),
    ).toEqual(known([]));
  });

  test("ignores a field left over for a block whose model is not on model API version 2", () => {
    expect(runErrorsOfBlock({ modelAPIVersion: 1, inputsValid, currentArgs: { n: 1 } })).toEqual(
      known([]),
    );
    expect(
      runErrorsOfBlock({ modelAPIVersion: undefined, inputsValid, currentArgs: { n: 1 } }),
    ).toEqual(known([]));
    expect(
      runErrorsOfBlock({ modelAPIVersion: 1, inputsValid: undefined, currentArgs: { n: 1 } }),
    ).toEqual(known([]));
  });
});

describe("currentArgsChange", () => {
  test("keeps current args equal to the derived ones, whatever their key order", () => {
    expect(currentArgsChange(JSON.parse('{ "b": 2, "a": 1 }'), runnable({ a: 1, b: 2 }))).toEqual({
      type: "keep",
    });
    expect(currentArgsChange({ n: 1 }, blocked({ n: 1 }, [missingThreshold]))).toEqual({
      type: "keep",
    });
  });

  test("writes derived args that differ from the current ones, or that are new", () => {
    expect(currentArgsChange({ n: 1 }, runnable({ n: 2 }))).toEqual({
      type: "write",
      data: canonicalJsonBytes({ n: 2 }),
    });
    expect(currentArgsChange(undefined, blocked({ n: 2 }, [missingThreshold]))).toEqual({
      type: "write",
      data: canonicalJsonBytes({ n: 2 }),
    });
  });

  test("deletes current args once there are none, and keeps no args as they are", () => {
    expect(currentArgsChange({ n: 1 }, absent())).toEqual({ type: "delete" });
    expect(currentArgsChange(undefined, absent())).toEqual({ type: "keep" });
  });
});

describe("runErrorsAllowRun", () => {
  test("only known run errors with no error let a block run", () => {
    expect(runErrorsAllowRun(known([]))).toBe(true);
    expect(runErrorsAllowRun(known([missingThreshold]))).toBe(false);
    expect(runErrorsAllowRun(UNKNOWN)).toBe(false);
  });
});

describe("argsRepair", () => {
  const STORAGE = '{"n":1}';

  test("leaves a block whose run errors are known as it is, without deriving", () => {
    const repair = argsRepair(
      {
        runErrors: known([]),
        currentArgs: { n: 1 },
        inputsValid: { value: recordBytes({ n: 1 }, []) },
        storageJson: STORAGE,
      },
      () => {
        throw new Error("must not derive");
      },
    );

    expect(repair).toEqual({ type: "none" });
  });

  test("a block opened with current args and no record gets the record, its args kept", () => {
    // What a project saved before the record existed holds.
    const block = { currentArgs: JSON.parse('{ "b": 2, "a": 1 }'), inputsValid: undefined };
    const repair = argsRepair(
      {
        ...block,
        runErrors: readRunErrorsField(undefined, block.currentArgs),
        storageJson: STORAGE,
      },
      () => runnable({ a: 1, b: 2 }),
    );

    expect(repair).toEqual({
      type: "rederived",
      currentArgs: { type: "keep" },
      inputsValid: { type: "write", data: recordBytes({ a: 1, b: 2 }, []) },
    });
  });

  test("a block whose record was written for other args gets args and record derived again", () => {
    const inputsValid = { value: recordBytes({ n: 1 }, []) };
    const repair = argsRepair(
      {
        runErrors: readRunErrorsField(inputsValid.value, { n: 2 }),
        currentArgs: { n: 2 },
        inputsValid,
        storageJson: STORAGE,
      },
      () => blocked({ n: 1, threshold: null }, [missingThreshold]),
    );

    expect(repair).toEqual({
      type: "rederived",
      currentArgs: { type: "write", data: canonicalJsonBytes({ n: 1, threshold: null }) },
      inputsValid: {
        type: "write",
        data: recordBytes({ n: 1, threshold: null }, [missingThreshold]),
      },
    });
  });

  test("a block whose storage derives no args loses its current args and record", () => {
    const inputsValid = { value: recordBytes({ n: 1 }, []) };
    const repair = argsRepair(
      { runErrors: UNKNOWN, currentArgs: { n: 2 }, inputsValid, storageJson: STORAGE },
      () => absent(),
    );

    expect(repair).toEqual({
      type: "rederived",
      currentArgs: { type: "delete" },
      inputsValid: { type: "delete" },
    });
  });

  test("a block without storage is left as it is", () => {
    expect(
      argsRepair(
        {
          runErrors: UNKNOWN,
          currentArgs: { n: 1 },
          inputsValid: undefined,
          storageJson: undefined,
        },
        () => runnable({ n: 1 }),
      ),
    ).toEqual({ type: "none" });
  });

  test("a repaired block reads as known, so the next load leaves it as it is", () => {
    const repair = argsRepair(
      { runErrors: UNKNOWN, currentArgs: { n: 2 }, inputsValid: undefined, storageJson: STORAGE },
      () => runnable({ n: 1 }),
    );
    if (repair.type !== "rederived" || repair.inputsValid.type !== "write") {
      throw new Error("expected the record to be written");
    }

    const runErrors = readRunErrorsField(repair.inputsValid.data, { n: 1 });
    expect(runErrors).toEqual(known([]));
    expect(
      argsRepair(
        {
          runErrors,
          currentArgs: { n: 1 },
          inputsValid: { value: repair.inputsValid.data },
          storageJson: STORAGE,
        },
        () => runnable({ n: 1 }),
      ),
    ).toEqual({ type: "none" });
  });
});

describe("ProjectHelper.deriveArgsFromStorage", () => {
  test("a model without run issues whose args() throws has no args and no run errors", () => {
    // What the SDK's __pl_args_derive returned before run issues, and still returns for a
    // block that declares no runIssues.
    const derived = helper.deriveArgsFromStorage(
      configWith('() => ({ error: "args() threw: Select a dataset" })'),
      "{}",
    );

    expect(derived).toEqual({ type: "absent", error: new Error("args() threw: Select a dataset") });
    expect(runErrorsFieldChange(undefined, derived)).toEqual({ type: "keep" });
  });

  test("a model without run issues whose args() succeeds has runnable args", () => {
    const derived = helper.deriveArgsFromStorage(configWith("() => ({ value: { n: 1 } })"), "{}");

    expect(derived).toEqual({ type: "runnable", args: { n: 1 } });
    expect(runErrorsFieldChange(undefined, derived)).toEqual({
      type: "write",
      data: recordBytes({ n: 1 }, []),
    });
  });

  test("runIssues that found errors block the args they were given", () => {
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

const UNKNOWN: RunErrorsState = { type: "unknown" };

function known(errors: RunIssue[]): RunErrorsState {
  return { type: "known", errors };
}

function runnable(args: unknown): DerivedArgs {
  return { type: "runnable", args };
}

function blocked(args: unknown, errors: RunIssue[]): DerivedArgs {
  return { type: "blocked", args, errors };
}

function recordBytes(args: unknown, errors: RunIssue[]): Uint8Array {
  const record: RunErrorsRecord = { argsFingerprint: argsFingerprint(args), errors };
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
