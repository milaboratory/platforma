/* RunCommand v3 (exec fallbacks spec §16.1): a software failure is an inspectable outcome, an
 * infrastructure failure stays an error, and the log tail is bounded. */
import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";
import { randomUUID } from "node:crypto";

type Outcome = {
  result: string;
  exitCode?: number;
  failDetails?: { reason: string; exitCode?: number };
  lastLogLines: string[];
  lastLogLinesTruncated: boolean;
  attempt: number;
  jobId: string;
  attemptLimit: number;
};

const json = (tx: Pl.PlTransaction, v: unknown) => tx.createValue(Pl.JsonObject, JSON.stringify(v));

const render = (
  helper: Parameters<Parameters<typeof tplTest>[1]>[0]["helper"],
  cmd: string,
  args: string[],
  errorLines: number,
  badExpression = false,
) =>
  helper.renderTemplate(true, "exec.fallback.run_v3", ["outcome", "workdirOut"], (tx) => ({
    cmd: json(tx, cmd),
    args: json(tx, args),
    errorLines: json(tx, errorLines),
    badExpression: json(tx, badExpression),
  }));

tplTest.concurrent(
  "AC1.1 RunCommand v3: a failed run sets outcome and workdirOut, no error",
  async ({ helper, expect }) => {
    const result = await render(
      helper,
      "sh",
      ["-c", `echo boom >&2; exit 2 # ${randomUUID()}`],
      10,
    );

    const outcome = await result
      .computeOutput("outcome", (a) => JSON.parse(a?.getDataAsString() ?? "null") as Outcome | null)
      .awaitStableValue();
    expect(outcome?.result).toBe("fail");
    expect(outcome?.exitCode).toBe(2);
    expect(outcome?.failDetails).toEqual({ reason: "SoftwareError", exitCode: 2 });
    expect(outcome?.lastLogLines.join("\n")).toContain("boom");
    expect(outcome?.attempt).toBe(0);
    expect(outcome?.attemptLimit).toBeGreaterThanOrEqual(1);

    const wd = await result
      .computeOutput("workdirOut", (a) => ({
        error: a?.getError() !== undefined,
        files: (JSON.parse(a?.getDataAsString() ?? "{}") as { files?: string[] }).files,
      }))
      .awaitStableValue();
    expect(wd?.error).toBe(false);
    expect(wd?.files).toContain("stderr.txt");
  },
  60_000,
);

tplTest.concurrent(
  "AC1.2 RunCommand v3: a failure before the process starts stays a resource error, no outcome",
  async ({ helper, expect }) => {
    // An unknown executable is not a start error on every driver: the local one starts it through
    // `env`, which exits 127, a software failure. An argument expression the backend cannot
    // evaluate fails before any process starts, on every driver.
    const result = await render(helper, "sh", ["-c", `true # ${randomUUID()}`], 10, true);
    const error = await result
      .computeOutput("outcome", (a) => a?.getDataAsString())
      .awaitStableValue()
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    if (process.env.DUMP_ERR) console.log("AC1.2 ERROR", (error as Error).message);
  },
  60_000,
);

tplTest.concurrent(
  "AC1.3 RunCommand v3: the log tail respects both the line and the byte limit",
  async ({ helper, expect }) => {
    const script = `line=$(printf '%01024d' 0 | tr 0 x); i=0; while [ $i -lt 10000 ]; do echo "$i $line"; i=$((i+1)); done; exit 3 # ${randomUUID()}`;
    for (const errorLines of [20, 1000]) {
      const result = await render(helper, "sh", ["-c", script], errorLines);
      const outcome = await result
        .computeOutput(
          "outcome",
          (a) => JSON.parse(a?.getDataAsString() ?? "null") as Outcome | null,
        )
        .awaitStableValue();
      expect(outcome?.exitCode).toBe(3);
      expect(outcome?.lastLogLines.length).toBeLessThanOrEqual(errorLines);
      expect(Buffer.byteLength(outcome?.lastLogLines.join("\n") ?? "")).toBeLessThanOrEqual(
        64 * 1024,
      );
      expect(outcome?.lastLogLinesTruncated).toBe(true);
      // the tail: the earliest lines are dropped first
      expect(outcome?.lastLogLines[outcome.lastLogLines.length - 1]).toMatch(/^9999 x+$/);
    }
  },
  120_000,
);
