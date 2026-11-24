import { beforeAll, describe, expect, test } from "vitest";
import { getQuickJS, type QuickJSWASMModule } from "quickjs-emscripten";
import type { BlockCodeWithInfo, ConfigRenderLambda } from "@platforma-sdk/model";
import { executeSingleLambda } from "../js_render";
import type { ExecCountersSnapshot } from "./exec_counters";
import {
  execCountersDelta,
  formatExecCountersDelta,
  JsExecCounters,
  TreePollCounters,
} from "./exec_counters";

const HANDLE = "__pl_test_lambda";

const lambda: ConfigRenderLambda = { __renderLambda: true, handle: HANDLE };

/** A model bundle that registers `body` as the callback behind {@link HANDLE}. */
function codeWith(body: string): BlockCodeWithInfo {
  return {
    code: {
      type: "plain",
      content: `globalThis.cfgRenderCtx.callbackRegistry[${JSON.stringify(HANDLE)}] = ${body};`,
    },
    sdkVersion: "1.0.0",
    featureFlags: undefined,
  };
}

function snapshot(patch: Partial<ExecCountersSnapshot>): ExecCountersSnapshot {
  return { bundleEvaluations: {}, callbacks: {}, transactions: {}, treePolls: {}, ...patch };
}

let quickJs: QuickJSWASMModule;

beforeAll(async () => {
  quickJs = await getQuickJS();
});

describe("TreePollCounters", () => {
  test("polls are counted per tree, and a snapshot keeps the counts it was taken with", () => {
    const counters = new TreePollCounters();
    counters.countPoll("project:p1");
    counters.countPoll("project:p1");
    counters.countPoll("projectList");
    const before = counters.snapshot();

    counters.countPoll("project:p1");

    expect(before).toEqual({ "project:p1": 2, projectList: 1 });
    expect(counters.snapshot()).toEqual({ "project:p1": 3, projectList: 1 });
  });
});

describe("JsExecCounters", () => {
  test("bundle evaluations and callbacks are counted per lambda", () => {
    const counters = new JsExecCounters();
    counters.countBundleEvaluation("block-output#table");
    counters.countCallback("block-output#table");
    counters.countCallback("block-output#table");
    counters.countBundleEvaluation("__pl_storage_applyUpdate");
    counters.countCallback("__pl_storage_applyUpdate");

    expect(counters.snapshot()).toEqual({
      bundleEvaluations: { "block-output#table": 1, __pl_storage_applyUpdate: 1 },
      callbacks: { "block-output#table": 2, __pl_storage_applyUpdate: 1 },
    });
  });

  test("a snapshot keeps the counts it was taken with", () => {
    const counters = new JsExecCounters();
    counters.countBundleEvaluation("title");
    const before = counters.snapshot();

    counters.countBundleEvaluation("title");

    expect(before.bundleEvaluations).toEqual({ title: 1 });
    expect(counters.snapshot().bundleEvaluations).toEqual({ title: 2 });
  });
});

describe("executeSingleLambda", () => {
  test("one call is one bundle evaluation and one callback of its lambda", () => {
    const counters = new JsExecCounters();

    executeSingleLambda(quickJs, counters, lambda, codeWith("(x) => x + 1"), 1);
    executeSingleLambda(quickJs, counters, lambda, codeWith("(x) => x + 1"), 2);

    expect(counters.snapshot()).toEqual({
      bundleEvaluations: { [HANDLE]: 2 },
      callbacks: { [HANDLE]: 2 },
    });
  });

  test("a callback that throws is still counted", () => {
    const counters = new JsExecCounters();

    expect(() =>
      executeSingleLambda(
        quickJs,
        counters,
        lambda,
        codeWith("() => { throw new Error('model failed'); }"),
      ),
    ).toThrow();

    expect(counters.snapshot()).toEqual({
      bundleEvaluations: { [HANDLE]: 1 },
      callbacks: { [HANDLE]: 1 },
    });
  });
});

describe("execCountersDelta", () => {
  test("gives the work done between two readings and leaves out names with none", () => {
    const before = snapshot({
      bundleEvaluations: { title: 3, "block-output#table": 1 },
      callbacks: { title: 3 },
      transactions: {
        ReadingTree: { committed: 0, closed: 10, conflict: 0, error: 0 },
        "ProjectAction: mutate-block-storage": { committed: 2, closed: 0, conflict: 1, error: 0 },
      },
    });
    const after = snapshot({
      bundleEvaluations: { title: 3, "block-output#table": 4, subtitle: 1 },
      callbacks: { title: 3, subtitle: 1 },
      transactions: {
        ReadingTree: { committed: 0, closed: 10, conflict: 0, error: 0 },
        "ProjectAction: mutate-block-storage": { committed: 3, closed: 1, conflict: 1, error: 0 },
        MLInitialization: { committed: 1, closed: 0, conflict: 0, error: 0 },
      },
      treePolls: { "project:p1": 7, projectList: 2, "project:p2": 1 },
    });

    expect(
      execCountersDelta({ ...before, treePolls: { "project:p1": 4, projectList: 2 } }, after),
    ).toEqual({
      bundleEvaluations: { "block-output#table": 3, subtitle: 1 },
      callbacks: { subtitle: 1 },
      transactions: {
        "ProjectAction: mutate-block-storage": { committed: 1, closed: 1, conflict: 0, error: 0 },
        MLInitialization: { committed: 1, closed: 0, conflict: 0, error: 0 },
      },
      treePolls: { "project:p1": 3, "project:p2": 1 },
    });
  });

  test("two equal readings give no work", () => {
    const reading = snapshot({
      bundleEvaluations: { title: 1 },
      callbacks: { title: 1 },
      transactions: { ReadingTree: { committed: 0, closed: 4, conflict: 0, error: 0 } },
      treePolls: { "project:p1": 4 },
    });

    expect(execCountersDelta(reading, reading)).toEqual(snapshot({}));
  });
});

describe("formatExecCountersDelta", () => {
  test("a delta is one line naming each transaction and lambda; an empty delta logs nothing", () => {
    const delta = snapshot({
      bundleEvaluations: { __pl_storage_applyUpdate: 2, "block-output#table": 1 },
      callbacks: { __pl_storage_applyUpdate: 2, "block-output#table": 3 },
      transactions: {
        "ProjectAction: mutateBlockStorage": { committed: 1, closed: 4, conflict: 0, error: 0 },
        ReadingTree: { committed: 0, closed: 12, conflict: 0, error: 1 },
      },
    });

    expect(formatExecCountersDelta(delta, 10_000)).toBe(
      "[exec-counters] 10s: " +
        'tx "ProjectAction: mutateBlockStorage" committed=1 closed=4 conflict=0 error=0; ' +
        'tx "ReadingTree" committed=0 closed=12 conflict=0 error=1; ' +
        "vm __pl_storage_applyUpdate=2 block-output#table=1",
    );
    expect(formatExecCountersDelta(snapshot({}), 10_000)).toBeUndefined();
  });

  test("each polling tree is named with its polls, so an idle project that still polls shows up", () => {
    const delta = snapshot({
      transactions: { ReadingTree: { committed: 0, closed: 6, conflict: 0, error: 0 } },
      treePolls: { "project:p1": 5, "status:p1/b1": 1 },
    });

    expect(formatExecCountersDelta(delta, 10_000)).toBe(
      "[exec-counters] 10s: " +
        'tx "ReadingTree" committed=0 closed=6 conflict=0 error=0; ' +
        "polls project:p1=5 status:p1/b1=1",
    );
    expect(formatExecCountersDelta(snapshot({ treePolls: { projectList: 1 } }), 10_000)).toBe(
      "[exec-counters] 10s: polls projectList=1",
    );
  });
});
