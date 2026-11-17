/* Exec time limits (MILAB-6913): a run that goes over its time limit is killed by the backend and
 * fails as TimeIsUp; a TimeIsUp handler runs instead, and without one the error names the limit.
 * Skipped on a backend that does not enforce time limits (exec.hasRunTimeLimit). */
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

type Helper = Parameters<Parameters<typeof tplTest>[1]>[0]["helper"];

const json = (tx: Pl.PlTransaction, v: unknown) => tx.createValue(Pl.JsonObject, JSON.stringify(v));

const hasRunTimeLimit = async (helper: Helper) =>
  (await helper
    .renderTemplate(false, "exec.time_limit.capability", ["runTimeLimit"], () => ({}))
    .then((r) =>
      r.computeOutput("runTimeLimit", (a) => a?.getDataAsJson<boolean>()).awaitStableValue(),
    )) === true;

const runPolicy = (helper: Helper, policy: string) =>
  helper.renderTemplate(false, "exec.time_limit.run", ["out", "attempts"], (tx) => ({
    nonce: json(tx, randomUUID()),
    policy: json(tx, policy),
  }));

tplTest.concurrent.for([
  // a different, quick command in place of the one that ran out of time
  { policy: "fast", plan: "fast", out: "fast\n" },
  // the same command, given more time by the handler's own limit
  { policy: "moreTime", plan: "moreTime", out: "ok\n" },
])(
  "exec time limit: the root runs out of time, the TimeIsUp handler runs ($policy)",
  async ({ policy, plan, out }, { helper, expect, skip }) => {
    if (!(await hasRunTimeLimit(helper))) return skip("the backend does not enforce time limits");

    const result = await runPolicy(helper, policy);

    expect(await result.computeOutput("out", (a) => a?.getDataAsString()).awaitStableValue()).toBe(
      out,
    );

    const attempts = await result
      .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
      .awaitStableValue();
    // The killed root may or may not report an exit code: a signal death has none locally, while
    // on Kubernetes the job entrypoint may record the code the stopped command exited with.
    expect(
      attempts?.map(({ attempt, plan, result, reason }) => ({ attempt, plan, result, reason })),
    ).toEqual([
      { attempt: 0, plan: "root", result: "fail", reason: "TimeIsUp" },
      { attempt: 1, plan, result: "success", reason: undefined },
    ]);
    expect(attempts?.[1]?.exitCode).toBe(0);
  },
  300_000,
);

tplTest.concurrent(
  "exec time limit: without a TimeIsUp handler the exec fails and the error names the limit",
  async ({ helper, expect, skip }) => {
    if (!(await hasRunTimeLimit(helper))) return skip("the backend does not enforce time limits");

    const result = await runPolicy(helper, "none");

    const error = await result
      .computeOutput("out", (a) => a?.getDataAsString())
      .awaitStableValue()
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    const msg = (error as Error).message;
    expect(msg).toContain("Time limit");
    expect(msg).toContain("#0 root fail TimeIsUp");
    expect(msg).toContain("no fallback for this failure");
  },
  300_000,
);

tplTest.concurrent(
  "exec time limit: a run within its limit succeeds, the TimeIsUp handler never runs",
  async ({ helper, expect, skip }) => {
    if (!(await hasRunTimeLimit(helper))) return skip("the backend does not enforce time limits");

    const result = await runPolicy(helper, "inTime");

    expect(await result.computeOutput("out", (a) => a?.getDataAsString()).awaitStableValue()).toBe(
      "ok\n",
    );
    const attempts = await result
      .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
      .awaitStableValue();
    expect(attempts).toEqual([{ attempt: 0, plan: "root", result: "success", exitCode: 0 }]);
  },
  300_000,
);
