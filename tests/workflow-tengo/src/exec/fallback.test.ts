/* Exec fallbacks (spec §16.2): a declared handler runs on the declared reason, an unhandled
 * failure reads as before plus the attempt history, and invalid fallback trees are refused before
 * anything is rendered. */
import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";
import { randomUUID } from "node:crypto";

type Attempt = {
  attempt: number;
  plan: string;
  result: string;
  reason?: string;
  exitCode?: number;
};

const json = (tx: Pl.PlTransaction, v: unknown) => tx.createValue(Pl.JsonObject, JSON.stringify(v));

// On Kubernetes the log tail is the job script's own lines ("[job-script] Process exited with
// code 1"), not the process output, so nothing in it can match a messageMatch pattern.
const ON_K8S = process.env.PL_TEST_K8S === "1";

// Whether the backend has WorkdirSave v3. Without it an exec without fallbacks runs on the
// RunCommand v2 path: its error has no attempt history, and its outputs fail as before.
type Helper = Parameters<Parameters<typeof tplTest>[1]>[0]["helper"];
const hasWorkdirSaveV3 = async (helper: Helper) =>
  (await helper
    .renderTemplate(false, "exec.fallback.capability", ["workdirSaveV3"], () => ({}))
    .then((r) =>
      r.computeOutput("workdirSaveV3", (a) => a?.getDataAsJson<boolean>()).awaitStableValue(),
    )) === true;

// forceSaveV1: a backend with RunCommand v3 but without WorkdirSave v3 (the _forceWorkdirSaveV1
// seam): fallbacks work the same, the success path saves with WorkdirSave v1.
tplTest.concurrent.for([{ forceSaveV1: false }, { forceSaveV1: true }])(
  "AC2.1 exec fallbacks: an exit-code handler runs, getAttempts() lists root then the handler (forceSaveV1: $forceSaveV1)",
  async ({ forceSaveV1 }, { helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.exit_code",
      ["out", "attempts"],
      (tx) => ({
        rootExit: json(tx, "2"),
        nonce: json(tx, randomUUID()),
        forceSaveV1: json(tx, forceSaveV1),
      }),
    );

    const out = await result.computeOutput("out", (a) => a?.getDataAsString()).awaitStableValue();
    expect(out).toBe("ok\n");

    const attempts = await result
      .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
      .awaitStableValue();
    expect(attempts).toEqual([
      { attempt: 0, plan: "root", result: "fail", reason: "SoftwareError", exitCode: 2 },
      { attempt: 1, plan: "ok", result: "success", exitCode: 0 },
    ]);
  },
  120_000,
);

// messageMatch end to end: the root exits 1, its output matches, the handler runs
tplTest.concurrent(
  "exec fallbacks: a messageMatch handler runs on the matching output",
  async ({ helper, expect, skip }) => {
    if (ON_K8S) return skip("the Kubernetes log tail carries no process output");
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.exit_code",
      ["out", "attempts"],
      (tx) => ({
        rootExit: json(tx, "1"),
        nonce: json(tx, randomUUID()),
        policy: json(tx, "messageMatch"),
      }),
    );
    expect(await result.computeOutput("out", (a) => a?.getDataAsString()).awaitStableValue()).toBe(
      "ok\n",
    );
    const attempts = await result
      .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
      .awaitStableValue();
    expect(attempts?.map((a) => [a.plan, a.result, a.exitCode])).toEqual([
      ["root", "fail", 1],
      ["ok", "success", 0],
    ]);
  },
  120_000,
);

// A handler in a queue without RunCommand v3 (the seam stands in for it): the exec runs without
// fallbacks, with a notice, instead of failing to render (spec §5)
tplTest.concurrent(
  "exec fallbacks: a handler without RunCommand v3 drops the fallbacks, the run stays",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(false, "exec.fallback.exit_code", ["out"], (tx) => ({
      rootExit: json(tx, "2"),
      nonce: json(tx, randomUUID()),
      handlerForceV2: json(tx, true),
    }));
    const error = await result
      .computeOutput("out", (a) => a?.getDataAsString())
      .awaitStableValue()
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Exited with code 2.");
    if (await hasWorkdirSaveV3(helper))
      expect((error as Error).message).toContain(
        "#0 root fail SoftwareError (exit 2) → no handler",
      );
  },
  120_000,
);

tplTest.concurrent(
  "AC2.2 exec fallbacks: nothing applies, the error is today's message plus the history",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(false, "exec.fallback.exit_code", ["out"], (tx) => ({
      rootExit: json(tx, "1"),
      nonce: json(tx, randomUUID()),
    }));

    const error = await result
      .computeOutput("out", (a) => a?.getDataAsString())
      .awaitStableValue()
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    const msg = (error as Error).message;
    expect(msg).toContain("Exited with code 1.");
    expect(msg).toContain("Command:");
    expect(msg).toContain("Latest output:");
    expect(msg).toContain("root-says-hello");
    expect(msg).toMatch(/Attempts \(1, backend cap \d+\):/);
    expect(msg).toContain("#0 root fail SoftwareError (exit 1) → no handler");
  },
  120_000,
);

tplTest.concurrent(
  "AC2.5 exec fallbacks: two jobs sharing a handler keep separate histories",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.two_jobs",
      ["outA", "outB", "attemptsA", "attemptsB"],
      (tx) => ({ nonce: json(tx, randomUUID()) }),
    );

    for (const job of ["A", "B"] as const) {
      const out = await result
        .computeOutput(`out${job}`, (a) => a?.getDataAsString())
        .awaitStableValue();
      expect(out).toBe("ok\n");
      const attempts = await result
        .computeOutput(`attempts${job}`, (a) => a?.getDataAsJson<Attempt[]>())
        .awaitStableValue();
      expect(attempts?.map((a) => [a.attempt, a.plan, a.result])).toEqual([
        [0, "root", "fail"],
        [1, "ok", "success"],
      ]);
    }
  },
  120_000,
);

// The local backend has no GPU execution: a GPU request finishes as GPUMissed with
// backendHasGPU false, the outcome a k8s runner reports after its schedule timeout.
tplTest.concurrent(
  "exec fallbacks: a GPUMissed handler runs the CPU plan",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.gpu_missed",
      ["out", "attempts"],
      (tx) => ({
        nonce: json(tx, randomUUID()),
      }),
    );

    const out = await result.computeOutput("out", (a) => a?.getDataAsString()).awaitStableValue();
    expect(out).toBe("cpu\n");
    const attempts = await result
      .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
      .awaitStableValue();
    expect(attempts).toEqual([
      { attempt: 0, plan: "root", result: "fail", reason: "GPUMissed" },
      { attempt: 1, plan: "cpuOnly", result: "success", exitCode: 0 },
    ]);
  },
  120_000,
);

tplTest.concurrent.for([
  { case: "cycle", expected: "root → OOM[0]: the handler is its own ancestor" },
  { case: "missingFile", expected: 'root → OOM[0]: saveFile: missing ["out.tsv"]' },
  { case: "extraFile", expected: 'root → OOM[0]: saveFile: not in the root ["more.tsv"]' },
  { case: "extraStream", expected: 'root → OOM[0]: streamFile: not in the root ["err.log"]' },
  { case: "processor", expected: 'root → OOM[0]: processWorkdir: "p" differs from the root' },
])(
  "AC2.4 exec fallbacks: verify() refuses an invalid tree ($case)",
  async ({ case: c, expected }, { helper, expect }) => {
    const result = await helper.renderTemplate(false, "exec.fallback.verify", ["out"], (tx) => ({
      case: json(tx, c),
    }));
    const error = await result
      .computeOutput("out", (a) => a?.getDataAsString())
      .awaitStableValue()
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("exec.builder: invalid fallbacks:");
    expect((error as Error).message).toContain(expected);
  },
);

// AC2.3 on the test backend itself: a chain of 4 plans is longer than the default attempt cap of 3
// and ends at the cap; a backend with a cap of 4 or more skips it.
tplTest.concurrent(
  "AC2.3 exec fallbacks: a chain longer than the backend's attempt cap ends at the cap",
  async ({ helper, expect, skip }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.cap_chain",
      ["out", "attempts"],
      (tx) => ({
        nonce: json(tx, randomUUID()),
      }),
    );
    const out = await result
      .computeOutput("out", (a) => a?.getDataAsString())
      .awaitStableValue()
      .catch((e: Error) => e);
    if (!(out instanceof Error)) return skip("the backend allows 4 attempts or more");
    const cap = Number(/backend cap (\d+)\)/.exec(out.message)?.[1]);
    expect(out.message).toContain(`Attempts (${cap}, backend cap ${cap}):`);
    expect(out.message).toMatch(/→ backend attempt limit reached/);
  },
  180_000,
);

tplTest.concurrent(
  "exec with a file named workdir saves it as before",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.workdir_file",
      ["out"],
      (tx) => ({
        nonce: json(tx, randomUUID()),
      }),
    );
    expect(await result.computeOutput("out", (a) => a?.getDataAsString()).awaitStableValue()).toBe(
      "named\n",
    );
  },
);

// Review 2 M1, review 3 T1/T2: a saved file the software never wrote. It is that file's error,
// not a restart and not a hang, with and without fallbacks and file sets. The rest is pinned as it
// is (decision D12): on RunCommand v2 the outputs that resolve before the file's index error stay
// readable; on v3 every output resolves after it, and the platform reports an error in one output
// of a render on every output read through it. Without WorkdirSave v3 on the backend the v3 path
// saves with WorkdirSave v1 and reads as the v2 one.
const partialSaveCases = [
  { forceV2: true, withFileSet: false },
  { forceV2: true, withFileSet: true },
  { forceV2: false, withFileSet: false },
  { forceV2: false, withFileSet: true },
];
tplTest.concurrent.for(partialSaveCases)(
  "exec: a saved file never written (v2: $forceV2, file set: $withFileSet)",
  async ({ forceV2, withFileSet }, { helper, expect }) => {
    const ok =
      forceV2 || !(await hasWorkdirSaveV3(helper))
        ? ["stdout", "attempts", ...(withFileSet ? ["set"] : [])]
        : [];
    const nonce = randomUUID();
    for (const withFallbacks of forceV2 ? [false] : [false, true]) {
      for (const which of [
        "stdout",
        "written",
        "never",
        "attempts",
        ...(withFileSet ? ["set"] : []),
      ]) {
        const result = await helper.renderTemplate(
          false,
          "exec.fallback.partial_save",
          ["out"],
          (tx) => ({
            nonce: json(tx, nonce + String(withFallbacks)),
            withFallbacks: json(tx, withFallbacks),
            withFileSet: json(tx, withFileSet),
            forceV2: json(tx, forceV2),
            which: json(tx, which),
          }),
        );
        const out = await result
          .computeOutput("out", (a) => a?.resourceType.name)
          .awaitStableValue()
          .then(
            () => "ok",
            (e: Error) => e,
          );
        if (ok.includes(which)) expect(out, which).toBe("ok");
        else expect(out, which).toBeInstanceOf(Error);
        if (which === "never") {
          expect((out as Error).message).toContain("never.txt");
          expect((out as Error).message).not.toContain("Working directory lost");
        }
      }
    }
  },
  300_000,
);

// Review 2, m4: a file set matching a file named workdir, the key WorkdirSave v3 reserves
tplTest.concurrent(
  "exec: a file set with a file named workdir is saved",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.workdir_file",
      ["out", "set"],
      (tx) => ({
        nonce: json(tx, randomUUID()),
      }),
    );
    expect(await result.computeOutput("out", (a) => a?.getDataAsString()).awaitStableValue()).toBe(
      "named\n",
    );
    const set = await result
      .computeOutput("set", (a) => ({
        fields: a?.listInputFields().sort(),
        workdir: a?.traverse("workdir")?.resourceType.name,
        other: a?.traverse("a.txt")?.resourceType.name,
      }))
      .awaitStableValue();
    expect(set?.fields).toEqual(["a.txt", "workdir"]);
    expect(set?.workdir).toMatch(/^Blob/);
    expect(set?.other).toMatch(/^Blob/);
  },
);

// Review 3, T6: nested handlers succeeding two levels deep. Plan keys are per policy, so entries
// without names repeat SoftwareError[0] at every level; the attempt index tells them apart.
tplTest.concurrent(
  "exec fallbacks: nested handlers, the deepest succeeds",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.cap_chain",
      ["out", "attempts"],
      (tx) => ({
        nonce: json(tx, randomUUID()),
        unnamed: json(tx, true),
      }),
    );
    expect(await result.computeOutput("out", (a) => a?.getDataAsString()).awaitStableValue()).toBe(
      "h2\n",
    );
    const attempts = await result
      .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
      .awaitStableValue();
    expect(attempts?.map((a) => [a.attempt, a.plan, a.result])).toEqual([
      [0, "root", "fail"],
      [1, "SoftwareError[0]", "fail"],
      [2, "SoftwareError[0]", "success"],
    ]);
  },
  180_000,
);

// Review 4, m2: getAttempts() follows the save, also without WorkdirSave v3
tplTest.concurrent.for([{ forceSaveV1: false }, { forceSaveV1: true }])(
  "exec: a failed save fails getAttempts() too (forceSaveV1: $forceSaveV1)",
  async ({ forceSaveV1 }, { helper, expect }) => {
    const result = await helper.renderTemplate(false, "exec.fallback.misc", ["out"], (tx) => ({
      case: json(tx, "failedSave"),
      nonce: json(tx, randomUUID()),
      forceSaveV1: json(tx, forceSaveV1),
    }));
    const out = await result
      .computeOutput("out", (a) => a?.getDataAsString())
      .awaitStableValue()
      .catch((e: Error) => e);
    expect(out).toBeInstanceOf(Error);
    expect((out as Error).message).toContain("the processor failed on purpose");
  },
  120_000,
);

// Review 4, m6: saveFileSetContent() saves the set under its name
tplTest.concurrent(
  "exec: saveFileSetContent saves the matching files' contents",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(false, "exec.fallback.misc", ["out"], (tx) => ({
      case: json(tx, "fileSetContent"),
      nonce: json(tx, randomUUID()),
    }));
    const set = await result
      .computeOutput("out", (a) => ({
        fields: a?.listInputFields().sort(),
        a: a?.traverse("a.txt")?.getDataAsString(),
        b: a?.traverse("b.txt")?.getDataAsString(),
      }))
      .awaitStableValue();
    expect(set).toEqual({ fields: ["a.txt", "b.txt"], a: "a\n", b: "b\n" });
  },
);

// Review 4: a handler whose RAM is a resource formula, evaluated by the router for the handler
tplTest.concurrent(
  "exec fallbacks: a handler with a resource formula gets its RAM",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(false, "exec.fallback.misc", ["out"], (tx) => ({
      case: json(tx, "formulaHandler"),
      nonce: json(tx, randomUUID()),
    }));
    const out = await result.computeOutput("out", (a) => a?.getDataAsString()).awaitStableValue();
    expect(Number(out?.trim())).toBe(96 * 1024 * 1024);
  },
);
