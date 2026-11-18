import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";
import { randomUUID } from "node:crypto";
import * as env from "../env";

/**
 * Custom metric collectors (exec.formula.collector, MILAB-6912) against a live backend: one
 * collector run writes several metrics, the job's RAM / CPU formulas read them, and the backend
 * grants what they compute. The job echoes the granted quota; see exec.metrics.custom_metric.
 */
const MIB = 1024 * 1024;

// core/platforma/assets/, mounted as the "library" storage: 327 bytes, 42 newlines
const FIXTURE_NAME = "maybe_the_number_of_lines_is_the_answer.txt";
const FIXTURE_NEWLINES = 42;

type Attempt = { attempt: number; plan: string; result: string; reason?: string };

async function fixtureHandle(driverKit: {
  lsDriver: {
    getStorageList: () => Promise<{ name: string; handle: unknown }[]>;
    listFiles: (h: unknown, p: string) => Promise<{ entries: { name: string; handle: unknown }[] }>;
  };
}) {
  const library = env.findLibraryStorage(await driverKit.lsDriver.getStorageList());
  if (!library) throw new Error(`library storage "${env.libraryStorage}" not found`);
  const files = await driverKit.lsDriver.listFiles(library.handle, "");
  const fixture = files.entries.find((f) => f.name === FIXTURE_NAME);
  if (!fixture) throw new Error(`fixture ${FIXTURE_NAME} not found in library storage`);
  return fixture.handle;
}

const json = (tx: { createValue: (t: typeof Pl.JsonObject, v: string) => unknown }, v: unknown) =>
  tx.createValue(Pl.JsonObject, JSON.stringify(v));

const cases = [
  {
    mode: "tag",
    desc: "the collector reads the job's own tagged file",
    ram: 512 * MIB + FIXTURE_NEWLINES * MIB,
    cpu: 1, // 327 bytes, not above 400
    plans: ["root"],
  },
  {
    mode: "explicit",
    desc: "the collector reads files it was given, the job stages none",
    ram: 512 * MIB + 2 * FIXTURE_NEWLINES * MIB,
    cpu: 2, // 654 bytes
    plans: ["root"],
  },
  {
    mode: "fallback",
    desc: "a fallback plan's formula reads a collector",
    ram: 512 * MIB + FIXTURE_NEWLINES * MIB,
    cpu: 1,
    plans: ["root", "sized"],
  },
] as const;

for (const tc of cases) {
  tplTest.concurrent(
    `custom metric (${tc.mode}): ${tc.desc}`,
    async ({ helper, expect, driverKit }) => {
      const handle = await fixtureHandle(driverKit);
      const result = await helper.renderTemplate(
        false,
        "exec.metrics.custom_metric",
        ["limits", "attempts"],
        (tx) => ({
          file: json(tx, handle),
          mode: json(tx, tc.mode),
          nonce: json(tx, randomUUID()),
        }),
      );

      const limits = await result
        .computeOutput("limits", (a) => a?.getDataAsString())
        .awaitStableValue();
      const [ram, cpu] = limits!.split(",").map(Number);
      // eslint-disable-next-line no-console
      console.log(
        `[custom-metric ${tc.mode}] granted ram=${ram} cpu=${cpu}; expected ram=${tc.ram} cpu=${tc.cpu}`,
      );
      expect(ram).toBe(tc.ram);
      expect(cpu).toBe(tc.cpu);

      const attempts = await result
        .computeOutput("attempts", (a) => a?.getDataAsJson<Attempt[]>())
        .awaitStableValue();
      expect(attempts?.map((a) => a.plan)).toEqual(tc.plans);
    },
    180_000,
  );
}

tplTest.concurrent(
  "custom metric (invalid): a collector that writes a float fails the job, naming the collector",
  async ({ helper, expect, driverKit }) => {
    const handle = await fixtureHandle(driverKit);
    await expect(async () => {
      const result = await helper.renderTemplate(
        false,
        "exec.metrics.custom_metric",
        ["limits"],
        (tx) => ({
          file: json(tx, handle),
          mode: json(tx, "invalid"),
          nonce: json(tx, randomUUID()),
        }),
      );
      await result.computeOutput("limits", (a) => a?.getDataAsString()).awaitStableValue();
    }).rejects.toThrow(/collector "stats" wrote 1\.5 for metric "lines"/);
  },
  180_000,
);
