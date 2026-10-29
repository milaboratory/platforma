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

// Needs a second backend started with --runner-max-job-attempts 1; its address in
// PL_ADDRESS_ATTEMPT_CAP_1. Skipped without it.
tplTest.skipIf(!process.env.PL_ADDRESS_ATTEMPT_CAP_1)(
  "AC2.3 exec fallbacks: the backend attempt cap wins",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(false, "exec.fallback.exit_code", ["out"], (tx) => ({
      rootExit: json(tx, "2"),
      nonce: json(tx, randomUUID()),
    }));
    const error = await result
      .computeOutput("out", (a) => a?.getDataAsString())
      .awaitStableValue()
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Attempts (1, backend cap 1):");
    expect((error as Error).message).toContain("→ backend attempt limit reached");
  },
  120_000,
);
