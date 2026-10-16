import { describe, expect, test } from "vitest";
import {
  issuesFoundFor,
  modelFingerprint,
  parseArgsIssuesRecord,
  parseDerivedArgs,
  storageFingerprint,
} from "./derived_args";

const warning = { severity: "warning", message: "Few samples" } as const;
const error = { severity: "error", message: "Abundance is required" } as const;

describe("parseDerivedArgs: results of a model that validates its args", () => {
  test("ready args carry their warnings", () => {
    expect(parseDerivedArgs({ type: "ready", value: { a: 1 }, issues: [warning] }, "args")).toEqual(
      { type: "ready", value: { a: 1 }, warnings: [warning] },
    );
  });

  test("ready args with no issues", () => {
    expect(parseDerivedArgs({ type: "ready", value: { a: 1 }, issues: [] }, "prerun")).toEqual({
      type: "ready",
      value: { a: 1 },
      warnings: [],
    });
  });

  test("ready args with an error are held back, as a draft", () => {
    expect(parseDerivedArgs({ type: "ready", value: { a: 1 }, issues: [error] }, "args")).toEqual({
      type: "blocked",
      issues: [error],
      draft: { a: 1 },
    });
  });

  test("an issue of unknown severity is an error", () => {
    const result = parseDerivedArgs(
      { type: "ready", value: { a: 1 }, issues: [{ severity: "fatal", message: "m" }] },
      "args",
    );

    expect(result).toEqual({
      type: "blocked",
      issues: [{ severity: "error", message: "m" }],
      draft: { a: 1 },
    });
  });

  test("skipped args are not ready, with no reason", () => {
    expect(parseDerivedArgs({ type: "skipped" }, "args")).toEqual({ type: "notReady" });
    expect(parseDerivedArgs({ type: "skipped", value: undefined }, "prerun")).toEqual({
      type: "notReady",
    });
  });

  test("invalid args keep every issue and the draft", () => {
    const result = parseDerivedArgs(
      {
        type: "invalid",
        error: "Abundance is required",
        issues: [error, warning],
        draft: { a: 1 },
      },
      "args",
    );

    expect(result).toEqual({ type: "blocked", issues: [error, warning], draft: { a: 1 } });
  });

  test("invalid args with no error among their issues get the error text as one", () => {
    const result = parseDerivedArgs(
      { type: "invalid", error: "Broken", issues: [warning], draft: { a: 1 } },
      "args",
    );

    expect(result).toEqual({
      type: "blocked",
      issues: [{ severity: "error", message: "Broken" }, warning],
      draft: { a: 1 },
    });
  });

  test("a throw is one error with no draft", () => {
    const result = parseDerivedArgs(
      {
        type: "threw",
        error: "args() threw: boom",
        issues: [{ severity: "error", message: "boom" }],
      },
      "args",
    );

    expect(result).toEqual({
      type: "blocked",
      issues: [{ severity: "error", message: "boom" }],
      draft: undefined,
    });
  });

  test("a throw with unreadable issues falls back to the error text, prefix cut", () => {
    const result = parseDerivedArgs(
      { type: "threw", error: "prerunArgs() threw: boom", issues: "nope" },
      "prerun",
    );

    expect(result).toEqual({
      type: "blocked",
      issues: [{ severity: "error", message: "boom" }],
      draft: undefined,
    });
  });

  test("a prerun held back by the block's args gives no reason of its own", () => {
    const result = parseDerivedArgs(
      { type: "blockedByArgs", error: "args() invalid (fallback): Abundance is required" },
      "prerun",
    );

    expect(result).toEqual({ type: "notReady" });
  });
});

describe("parseDerivedArgs: results of an older model", () => {
  test("a value is ready args with no warnings", () => {
    expect(parseDerivedArgs({ value: { a: 1 } }, "args")).toEqual({
      type: "ready",
      value: { a: 1 },
      warnings: [],
    });
  });

  test("an undefined value is not ready, with no reason", () => {
    expect(parseDerivedArgs({ value: undefined }, "args")).toEqual({ type: "notReady" });
    expect(parseDerivedArgs({}, "prerun")).toEqual({ type: "notReady" });
  });

  test("a throw from args() is one error, without the prefix", () => {
    expect(parseDerivedArgs({ error: "args() threw: Abundance is required" }, "args")).toEqual({
      type: "blocked",
      issues: [error],
      draft: undefined,
    });
  });

  test("a throw from prerunArgs() is one error, without the prefix", () => {
    expect(parseDerivedArgs({ error: "prerunArgs() threw: boom" }, "prerun")).toEqual({
      type: "blocked",
      issues: [{ severity: "error", message: "boom" }],
      draft: undefined,
    });
  });

  test("a prerun that fell back to throwing args() gives no reason of its own", () => {
    expect(parseDerivedArgs({ error: "args() threw (fallback): boom" }, "prerun")).toEqual({
      type: "notReady",
    });
  });

  test("an error without a known prefix is kept as is", () => {
    expect(parseDerivedArgs({ error: "something else" }, "args")).toEqual({
      type: "blocked",
      issues: [{ severity: "error", message: "something else" }],
      draft: undefined,
    });
  });
});

describe("parseDerivedArgs: malformed results", () => {
  test("a result that is not an object is a failure", () => {
    expect(parseDerivedArgs(undefined, "args").type).toBe("failed");
    expect(parseDerivedArgs("ready", "args").type).toBe("failed");
  });
});

describe("issues record", () => {
  const storage = '{"__pl_a7f3e2b9__":"v1","__dataVersion":1,"__data":{}}';
  const storageHash = storageFingerprint(storage);
  const model = { code: { type: "plain", content: "model v1" } } as const;
  const modelHash = modelFingerprint(model);
  const source = { storageHash, modelHash };

  test("the storage fingerprint depends on the storage text", () => {
    expect(storageFingerprint(storage)).toBe(storageHash);
    expect(storageFingerprint(storage.replace("{}", '{"a":1}'))).not.toBe(storageHash);
  });

  test("the model fingerprint depends on the model code", () => {
    expect(modelFingerprint({ code: { type: "plain", content: "model v1" } })).toBe(modelHash);
    expect(modelFingerprint({ code: { type: "plain", content: "model v2" } })).not.toBe(modelHash);
  });

  test("issues found for the current storage and model are read", () => {
    expect(issuesFoundFor({ ...source, issues: [error, warning] }, source)).toEqual([
      error,
      warning,
    ]);
  });

  test("issues found for other storage are none", () => {
    expect(issuesFoundFor({ ...source, storageHash: "other", issues: [error] }, source)).toEqual(
      [],
    );
    expect(issuesFoundFor({ ...source, issues: [error] }, undefined)).toEqual([]);
  });

  test("issues found by another model for the same storage are none", () => {
    expect(issuesFoundFor({ ...source, modelHash: "other", issues: [error] }, source)).toEqual([]);
  });

  test("a malformed record has no issues", () => {
    expect(parseArgsIssuesRecord([error])).toBeUndefined();
    expect(parseArgsIssuesRecord(source)).toBeUndefined();
    expect(parseArgsIssuesRecord({ storageHash, issues: [error] })).toBeUndefined();
    expect(issuesFoundFor({ issues: [error] }, source)).toEqual([]);
  });

  test("issues of a record are read with their severity checked", () => {
    expect(parseArgsIssuesRecord({ ...source, issues: [{ severity: "x", message: "m" }] })).toEqual(
      { ...source, issues: [{ severity: "error", message: "m" }] },
    );
  });
});
