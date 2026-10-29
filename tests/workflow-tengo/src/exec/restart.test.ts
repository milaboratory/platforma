/* Restart after a lost working directory (exec fallbacks spec §14), tested as decision D5 says: a
 * first render runs the command and returns its post-run working directory; the test deletes the
 * directory from disk; a second render runs the save chain and the wd-retrier on it.
 *
 * Needs the work storage root of the backend on this machine in PL_TEST_WORK_STORAGE_ROOT (CI sets
 * it to the pl-compose main root's work directory); skipped without it, and on a backend without
 * WorkdirSave v3. */
import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";
import { expect } from "vitest";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";

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

type SecondOptions = {
  restartLimit: number;
  attempt?: number;
  restart?: number;
  withProcessor?: boolean;
  withCollection?: boolean;
};

type Collection = {
  type?: string;
  dynamic: string[];
  attempt1?: string;
  outcome1?: unknown;
  streamHash?: string;
};

function readCollection(a: PlTreeNodeAccessor | undefined): Collection {
  const json = (n: PlTreeNodeAccessor | undefined) => {
    const t = n?.getDataAsString();
    return t ? (JSON.parse(t) as unknown) : undefined;
  };
  return {
    type: a?.resourceType.name,
    dynamic: a?.listDynamicFields() ?? [],
    attempt1: a?.traverse("attempt1")?.resourceType.name,
    outcome1: json(a?.traverse("outcome1")),
    streamHash: (json(a?.traverse("stream")) as { hashValue?: string } | undefined)?.hashValue,
  };
}

/** The second render: wave 2 on that working directory. Undefined without WorkdirSave v3. */
async function secondRender(
  helper: Helper,
  workdir: Awaited<ReturnType<typeof firstRender>>,
  opts: SecondOptions,
) {
  const result = await helper.renderTemplate(
    true,
    "exec.fallback.restart",
    ["workdirSaveV3", "out", "processed", "attempts", "collection"],
    (tx) => ({
      workdir,
      restartLimit: json(tx, opts.restartLimit),
      nonce: json(tx, randomUUID()),
      attempt: json(tx, opts.attempt ?? 0),
      restart: json(tx, opts.restart ?? 0),
      withProcessor: json(tx, opts.withProcessor ?? false),
      withCollection: json(tx, opts.withCollection ?? false),
    }),
  );
  const v3 = await result
    .computeOutput("workdirSaveV3", (a) => a?.getDataAsJson<boolean>())
    .awaitStableValue();
  if (!v3) return undefined;

  const out = await result
    .computeOutput("out", (a) => a?.getDataAsString())
    .awaitStableValue()
    .catch((e: Error) => e);
  if (out instanceof Error) return { out };

  const attempts = await result
    .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
    .awaitStableValue();
  const processed = opts.withProcessor
    ? await result
        .computeOutput("processed", (a) => a?.traverse("out")?.getDataAsString())
        .awaitStableValue()
    : undefined;
  let collection: Collection | undefined;
  if (opts.withCollection) {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      collection = await result.computeOutput("collection", (a) => readCollection(a)).getValue();
      if (collection?.streamHash) break;
      await new Promise((res) => setTimeout(res, 250));
    }
  }
  return { out, attempts, processed, collection };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

tplTest.skipIf(WORK_ROOT === undefined)(
  "exec restart: a saved working directory is handed out, no restart",
  async ({ helper, expect, skip }) => {
    const r = await secondRender(helper, await firstRender(helper, false), { restartLimit: 3 });
    if (r === undefined) return skip("no WorkdirSave v3 on the backend");
    expect(r.out).toBe("first\n");
    expect(r.attempts).toEqual([{ attempt: 0, plan: "root", result: "success", exitCode: 0 }]);
  },
  120_000,
);

tplTest.skipIf(WORK_ROOT === undefined)(
  "exec restart: a lost working directory runs the same plan again",
  async ({ helper, expect, skip }) => {
    const r = await secondRender(helper, await firstRender(helper, true), { restartLimit: 3 });
    if (r === undefined) return skip("no WorkdirSave v3 on the backend");
    expect(r.out).toBe("restarted\n");
    expect(r.attempts).toEqual([
      { attempt: 0, plan: "root", result: "workdirMissing", restart: 0 },
      { attempt: 0, plan: "root", result: "success", exitCode: 0 },
    ]);
  },
  120_000,
);

tplTest.skipIf(WORK_ROOT === undefined)(
  "exec restart: the restart limit ends the job with the error",
  async ({ helper, expect, skip }) => {
    const r = await secondRender(helper, await firstRender(helper, true), { restartLimit: 0 });
    if (r === undefined) return skip("no WorkdirSave v3 on the backend");
    expect(r.out).toBeInstanceOf(Error);
    expect((r.out as Error).message).toContain("Working directory lost, restart limit (0) reached");
    expect((r.out as Error).message).toContain(
      "#0 root workdirMissing (restart 0) → restart limit reached",
    );
  },
  120_000,
);

// Review finding M1: a workdir processor reads the directory through a save of its own, before the
// main save; the wd-retrier probes the directory instead of waiting for the main save forever.
tplTest.skipIf(WORK_ROOT === undefined).for([{ lost: false }, { lost: true }])(
  "exec restart: with a workdir processor (lost: $lost)",
  async ({ lost }, { helper, expect, skip }) => {
    const r = await secondRender(helper, await firstRender(helper, lost), {
      restartLimit: 3,
      withProcessor: true,
    });
    if (r === undefined) return skip("no WorkdirSave v3 on the backend");
    const text = lost ? "restarted\n" : "first\n";
    expect(r.out).toBe(text);
    expect(r.processed).toBe(text);
    expect(r.attempts?.map((a) => a.result)).toEqual(
      lost ? ["workdirMissing", "success"] : ["success"],
    );
  },
  120_000,
);

// A restart of a fallback attempt: same attempt index and plan, the restart writes attempt<K> of
// the collection, and the restart counter is per job (spec §14.3).
tplTest.skipIf(WORK_ROOT === undefined)(
  "exec restart: a fallback attempt is restarted under its own index and plan",
  async ({ helper, expect, skip }) => {
    const r = await secondRender(helper, await firstRender(helper, true), {
      restartLimit: 3,
      attempt: 1,
      withCollection: true,
    });
    if (r === undefined) return skip("no WorkdirSave v3 on the backend");
    expect(r.out).toBe("restarted\n");
    expect(r.attempts).toEqual([
      { attempt: 0, plan: "root", result: "fail", reason: "SoftwareError", exitCode: 2 },
      { attempt: 1, plan: "h1", result: "workdirMissing", restart: 0 },
      { attempt: 1, plan: "h1", result: "success", exitCode: 0 },
    ]);
    expect(r.collection?.type).toBe("StreamCollection");
    expect(r.collection?.attempt1).toBe("StreamManager");
    expect(r.collection?.outcome1).toEqual({
      attempt: 1,
      plan: "h1",
      result: "success",
      exitCode: 0,
    });
    expect(r.collection?.streamHash).toBe(sha256("restarted\n"));
  },
  120_000,
);

tplTest.skipIf(WORK_ROOT === undefined)(
  "exec restart: the restart counter is per job, across attempts",
  async ({ helper, expect, skip }) => {
    const r = await secondRender(helper, await firstRender(helper, true), {
      restartLimit: 1,
      attempt: 1,
      restart: 1,
    });
    if (r === undefined) return skip("no WorkdirSave v3 on the backend");
    expect(r.out).toBeInstanceOf(Error);
    expect((r.out as Error).message).toContain("restart limit (1) reached");
    expect((r.out as Error).message).toContain(
      "#1 h1 workdirMissing (restart 1) → restart limit reached",
    );
  },
  120_000,
);

// Review finding M2: a job starting on a collection that holds an earlier job's attempts.
tplTest(
  "exec streams: attempt 0 of a job removes an earlier job's attempts from the collection",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.fallback.stale_collection",
      ["collection", "started"],
      (tx) => ({
        nonce: json(tx, randomUUID()),
      }),
    );
    expect(
      await result.computeOutput("started", (a) => a?.getDataAsJson<boolean>()).awaitStableValue(),
    ).toBe(true);
    const deadline = Date.now() + 30_000;
    let fields: string[] = [];
    while (Date.now() < deadline) {
      fields =
        (await result.computeOutput("collection", (a) => a?.listDynamicFields()).getValue()) ?? [];
      if (!fields.includes("attempt1")) break;
      await new Promise((res) => setTimeout(res, 250));
    }
    expect(fields.sort()).toEqual(["attempt0", "stream"]);
    const attempt0 = await result
      .computeOutput("collection", (a) => a?.traverse("attempt0")?.getDataAsString())
      .awaitStableValue();
    expect(attempt0).toBe(JSON.stringify("new manager"));
  },
);
