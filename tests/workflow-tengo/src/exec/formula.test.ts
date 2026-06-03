import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";
import * as env from "../env";

/**
 * End-to-end proof that resource formulas (memFormula / cpuFormula) are
 * evaluated at runtime against a LIVE backend, and that the line-counter
 * sub-exec actually runs.
 *
 * Mechanism: the template runs the hello-world test software with the argument
 * "{system.ram.bytes},{system.cpu}", which the backend substitutes with the
 * ACTUALLY-ALLOCATED quota; the software echoes it to stdout. We read stdout
 * and compare against the value the formula should have produced.
 *
 * The input file comes from the data-library storage (the same mechanism the
 * existing cat_on_file test uses) — a local-file upload (getLocalFileHandle)
 * does not complete in this harness, so we use the server-side library file.
 */
const GIB = 1024 * 1024 * 1024;
const MIB = 1024 * 1024;

// Stable data-library asset (core/platforma/assets/, mounted as the "library"
// storage by the backend): 327 bytes, 42 newlines.
const FIXTURE_NAME = "maybe_the_number_of_lines_is_the_answer.txt";
const FIXTURE_BYTES = 327;
const FIXTURE_NEWLINES = 42;

async function libraryFileHandle(driverKit: {
  lsDriver: {
    getStorageList: () => Promise<{ name: string; handle: unknown }[]>;
    listFiles: (h: unknown, p: string) => Promise<{ entries: { name: string; handle: unknown }[] }>;
  };
}) {
  const storages = await driverKit.lsDriver.getStorageList();
  const library = storages.find((s) => s.name === env.libraryStorage);
  if (!library) throw new Error(`library storage "${env.libraryStorage}" not found`);
  const files = await driverKit.lsDriver.listFiles(library.handle, "");
  const ourFile = files.entries.find((f) => f.name === FIXTURE_NAME);
  if (!ourFile) throw new Error(`fixture ${FIXTURE_NAME} not found in library storage`);
  return ourFile.handle;
}

/**
 * size formula: memFormula(f.add(f.gib(1), f.size("reads"))) = 1 GiB + S bytes.
 * cpuFormula(f.add(2, 1)) = 3 cores.
 * Proves a `size` metric flows from the input blob into the allocated RAM, and
 * cpu reflects the formula (not a queue default).
 */
tplTest.concurrent(
  "formula-size: ram = 1GiB + fileSize, cpu = 3",
  async ({ helper, expect, driverKit }) => {
    const handle = await libraryFileHandle(driverKit);

    const result = await helper.renderTemplate(
      false,
      "exec.run.formula_limits",
      ["limits"],
      (tx) => ({
        file: tx.createValue(Pl.JsonObject, JSON.stringify(handle)),
        mode: tx.createValue(Pl.JsonObject, JSON.stringify("size")),
      }),
    );

    const limits = await result
      .computeOutput("limits", (a) => a?.getDataAsString())
      .awaitStableValue();

    expect(limits).toBeDefined();
    const [ramStr, cpuStr] = limits!.split(",");
    const ram = Number(ramStr);
    const cpu = Number(cpuStr);

    const expectedRam = 1 * GIB + FIXTURE_BYTES;
    // eslint-disable-next-line no-console
    console.log(
      `[formula-size] ram=${ram} cpu=${cpu} | expected ram=${expectedRam} (1GiB + ${FIXTURE_BYTES}) cpu=3`,
    );

    expect(ram).eq(expectedRam);
    expect(cpu).eq(3);
  },
  120000,
);

/**
 * lineCount formula: memFormula(f.add(f.mib(512), f.mul(f.lineCount("reads"), 1024)))
 * = 512 MiB + L * 1024 bytes. cpuFormula(f.add(1, 1)) = 2.
 * Proves the line-counter sub-exec fetched the software, ran, and produced a
 * line count (newline count = 42) that flowed into the allocated RAM.
 */
tplTest.concurrent(
  "formula-lineCount: ram = 512MiB + lineCount*1024, cpu = 2",
  async ({ helper, expect, driverKit }) => {
    const handle = await libraryFileHandle(driverKit);

    const result = await helper.renderTemplate(
      false,
      "exec.run.formula_limits",
      ["limits"],
      (tx) => ({
        file: tx.createValue(Pl.JsonObject, JSON.stringify(handle)),
        mode: tx.createValue(Pl.JsonObject, JSON.stringify("lineCount")),
      }),
    );

    const limits = await result
      .computeOutput("limits", (a) => a?.getDataAsString())
      .awaitStableValue();

    expect(limits).toBeDefined();
    const [ramStr, cpuStr] = limits!.split(",");
    const ram = Number(ramStr);
    const cpu = Number(cpuStr);

    const expectedRam = 512 * MIB + FIXTURE_NEWLINES * 1024;
    const observedLineCount = (ram - 512 * MIB) / 1024;
    // eslint-disable-next-line no-console
    console.log(
      `[formula-lineCount] ram=${ram} cpu=${cpu} | expected ram=${expectedRam} lineCount=${FIXTURE_NEWLINES} observed=${observedLineCount}`,
    );

    expect(ram).eq(expectedRam);
    expect(cpu).eq(2);
  },
  120000,
);

/**
 * Plumbing-only: a CONSTANT formula with no file and no metric. Confirms the
 * formula meta-input path (builder -> pure template -> ephemeral impl eval ->
 * quota override) end-to-end, independent of file import / metric resolution.
 */
tplTest.concurrent(
  "formula-const: ram = 2GiB, cpu = 3 (no file, no metric)",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.run.formula_const",
      ["limits"],
      (_tx) => ({}),
    );

    const limits = await result
      .computeOutput("limits", (a) => a?.getDataAsString())
      .awaitStableValue();

    expect(limits).toBeDefined();
    const [ramStr, cpuStr] = limits!.split(",");
    // eslint-disable-next-line no-console
    console.log(
      `[formula-const] ram=${Number(ramStr)} cpu=${Number(cpuStr)} | expected ram=${2 * GIB} cpu=3`,
    );

    expect(Number(ramStr)).eq(2 * GIB);
    expect(Number(cpuStr)).eq(3);
  },
  60000,
);
