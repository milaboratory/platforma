/* Restart after a lost working directory (exec fallbacks spec §14), tested as decision D5 says: a
 * first render runs the command and returns its post-run working directory; the test deletes the
 * directory from disk; a second render runs the save chain and the wd-retrier on it.
 *
 * Needs the work storage root of the backend on this machine in PL_TEST_WORK_STORAGE_ROOT, and a
 * backend with WorkdirSave v3; skipped without the root. */
import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";
import { expect } from "vitest";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

type Attempt = {
  attempt: number;
  plan: string;
  result: string;
  restart?: number;
  exitCode?: number;
};

const WORK_ROOT = process.env.PL_TEST_WORK_STORAGE_ROOT;
const json = (tx: Pl.PlTransaction, v: unknown) => tx.createValue(Pl.JsonObject, JSON.stringify(v));

type Helper = Parameters<Parameters<typeof tplTest>[1]>[0]["helper"];

/** The first render: a command whose post-run working directory is returned, then deleted or kept. */
async function firstRender(helper: Helper, deleteWorkdir: boolean) {
  const first = await helper.renderTemplate(
    true,
    "exec.fallback.run_v3",
    ["outcome", "workdirOut"],
    (tx) => ({
      cmd: json(tx, "sh"),
      args: json(tx, ["-c", `echo first > out.txt # ${randomUUID()}`]),
      errorLines: json(tx, 10),
    }),
  );
  const wd = await first
    .computeOutput("workdirOut", (a) => {
      const storage = a?.traverse("storage")?.getDataAsString();
      if (a === undefined || storage === undefined) return undefined;
      return { id: a.id, location: (JSON.parse(storage) as { Location: string }).Location };
    })
    .awaitStableValue();
  const dir = path.join(WORK_ROOT!, wd!.location);
  expect(fs.existsSync(dir)).toBe(true);
  if (deleteWorkdir) fs.rmSync(dir, { recursive: true, force: true });
  return wd!.id;
}

/** The second render: wave 2 on that working directory. */
async function secondRender(
  helper: Helper,
  workdir: Awaited<ReturnType<typeof firstRender>>,
  restartLimit: number,
) {
  const result = await helper.renderTemplate(
    true,
    "exec.fallback.restart",
    ["out", "attempts"],
    (tx) => ({
      workdir,
      restartLimit: json(tx, restartLimit),
      nonce: json(tx, randomUUID()),
    }),
  );
  const out = await result
    .computeOutput("out", (a) => a?.getDataAsString())
    .awaitStableValue()
    .catch((e: Error) => e);
  const attempts =
    out instanceof Error
      ? undefined
      : await result
          .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
          .awaitStableValue();
  return { out, attempts };
}

tplTest.skipIf(WORK_ROOT === undefined)(
  "exec restart: a saved working directory is handed out, no restart",
  async ({ helper, expect }) => {
    const { out, attempts } = await secondRender(helper, await firstRender(helper, false), 3);
    expect(out).toBe("first\n");
    expect(attempts).toEqual([{ attempt: 0, plan: "root", result: "success", exitCode: 0 }]);
  },
  120_000,
);

tplTest.skipIf(WORK_ROOT === undefined)(
  "exec restart: a lost working directory runs the same plan again",
  async ({ helper, expect }) => {
    const { out, attempts } = await secondRender(helper, await firstRender(helper, true), 3);
    expect(out).toBe("restarted\n");
    expect(attempts).toEqual([
      { attempt: 0, plan: "root", result: "workdirMissing", restart: 0 },
      { attempt: 0, plan: "root", result: "success", exitCode: 0 },
    ]);
  },
  120_000,
);

tplTest.skipIf(WORK_ROOT === undefined)(
  "exec restart: the restart limit ends the job with the error",
  async ({ helper, expect }) => {
    const { out } = await secondRender(helper, await firstRender(helper, true), 0);
    expect(out).toBeInstanceOf(Error);
    expect((out as Error).message).toContain("Working directory lost, restart limit (0) reached");
    expect((out as Error).message).toContain(
      "#0 root workdirMissing (restart 0) → restart limit reached",
    );
  },
  120_000,
);
