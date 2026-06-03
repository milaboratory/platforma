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

// Gzipped fixture (decompresses to 5 newlines) for the uppercase-compressed
// lineCount path. Added under an UPPERCASE ".GZ" name in formula_gz.tpl.tengo.
const GZ_FIXTURE_NAME = "formula_gz_5lines.fastq.gz";
const GZ_FIXTURE_LINES = 5;

async function libraryFileHandle(
  driverKit: {
    lsDriver: {
      getStorageList: () => Promise<{ name: string; handle: unknown }[]>;
      listFiles: (
        h: unknown,
        p: string,
      ) => Promise<{ entries: { name: string; handle: unknown }[] }>;
    };
  },
  name = FIXTURE_NAME,
) {
  const storages = await driverKit.lsDriver.getStorageList();
  const library = storages.find((s) => s.name === env.libraryStorage);
  if (!library) throw new Error(`library storage "${env.libraryStorage}" not found`);
  const files = await driverKit.lsDriver.listFiles(library.handle, "");
  const ourFile = files.entries.find((f) => f.name === name);
  if (!ourFile) throw new Error(`fixture ${name} not found in library storage`);
  return ourFile.handle;
}

/**
 * File-based cases — rendered via exec.run.formula_limits with a `mode` input.
 * Each `mode` selects a mem/cpu formula inside the template; we read back the
 * allocated quota the backend echoes and assert it equals the formula's output.
 *
 * Coverage spread across the modes:
 *   size      — a size metric flows from the input blob into allocated RAM.
 *   lineCount — the line-counter sub-exec runs and its count flows into RAM.
 *   multi     — two files under one tag: size sums both blobs and lineCount sums
 *               both counts (metric map has 2 entries → exercises the aggregate
 *               map + the impl's wildcard await), and divCeil rounds up.
 */
const fileCases = [
  {
    mode: "size",
    desc: "ram = 1GiB + fileSize, cpu = 3",
    expectedRam: 1 * GIB + FIXTURE_BYTES,
    expectedCpu: 3,
  },
  {
    mode: "lineCount",
    desc: "ram = 512MiB + lineCount*1024, cpu = 2",
    expectedRam: 512 * MIB + FIXTURE_NEWLINES * 1024,
    expectedCpu: 2,
  },
  {
    mode: "multi",
    // cpu = divCeil(2*lineCount, 50); ceiling of 84/50 = 2 (truncating div = 1).
    // Robust to a ±1 newline-vs-line ambiguity in the counter: divCeil(86,50)=2 too.
    desc: "ram = 1GiB + 2*fileSize, cpu = divCeil(2*lineCount, 50) (multi-file aggregation)",
    expectedRam: 1 * GIB + 2 * FIXTURE_BYTES,
    expectedCpu: Math.ceil((2 * FIXTURE_NEWLINES) / 50),
  },
] as const;

for (const tc of fileCases) {
  tplTest.concurrent(
    `formula-${tc.mode}: ${tc.desc}`,
    async ({ helper, expect, driverKit }) => {
      const handle = await libraryFileHandle(driverKit);

      const result = await helper.renderTemplate(
        false,
        "exec.run.formula_limits",
        ["limits"],
        (tx) => ({
          file: tx.createValue(Pl.JsonObject, JSON.stringify(handle)),
          mode: tx.createValue(Pl.JsonObject, JSON.stringify(tc.mode)),
        }),
      );

      const limits = await result
        .computeOutput("limits", (a) => a?.getDataAsString())
        .awaitStableValue();

      expect(limits).toBeDefined();
      const [ramStr, cpuStr] = limits!.split(",");
      // eslint-disable-next-line no-console
      console.log(
        `[formula-${tc.mode}] ram=${ramStr} cpu=${cpuStr} | expected ram=${tc.expectedRam} cpu=${tc.expectedCpu}`,
      );

      expect(Number(ramStr)).eq(tc.expectedRam);
      expect(Number(cpuStr)).eq(tc.expectedCpu);
    },
    120000,
  );
}

/**
 * Constant-only cases — no file, no metric. Each renders its own template (the
 * formula is baked into the template, not selected by a `mode` input) and proves
 * a different slice of the evaluator wires through the ephemeral impl:
 *   formula_const — the constant-arithmetic plumbing (builder → pure template →
 *                   ephemeral impl eval → quota override), independent of files.
 *   formula_ops   — non-arithmetic ops (clamp, comparison, conditional) evaluate
 *                   against the real evaluator, not just the unit-test resolver.
 */
const constCases = [
  {
    template: "exec.run.formula_const",
    desc: "ram = 2GiB, cpu = 3 (no file, no metric)",
    expectedRam: 2 * GIB,
    expectedCpu: 3,
  },
  {
    template: "exec.run.formula_ops",
    desc: "ram = 4GiB (clamp caps 8GiB→4GiB), cpu = 2 (if/gt selects)",
    expectedRam: 4 * GIB,
    expectedCpu: 2,
  },
] as const;

for (const tc of constCases) {
  tplTest.concurrent(
    `${tc.template}: ${tc.desc}`,
    async ({ helper, expect }) => {
      const result = await helper.renderTemplate(false, tc.template, ["limits"], (_tx) => ({}));

      const limits = await result
        .computeOutput("limits", (a) => a?.getDataAsString())
        .awaitStableValue();

      expect(limits).toBeDefined();
      const [ramStr, cpuStr] = limits!.split(",");
      // eslint-disable-next-line no-console
      console.log(
        `[${tc.template}] ram=${ramStr} cpu=${cpuStr} | expected ram=${tc.expectedRam} cpu=${tc.expectedCpu}`,
      );

      expect(Number(ramStr)).eq(tc.expectedRam);
      expect(Number(cpuStr)).eq(tc.expectedCpu);
    },
    60000,
  );
}

/**
 * Uppercase-compressed input, end-to-end. The fixture is gzipped and added under
 * an UPPERCASE ".GZ" name (see formula_gz.tpl.tengo). Passing proves two things
 * line up: the SDK strips the uppercase compression suffix to accept lineCount,
 * AND the wired line-counter binary (>= 1.1.1, via software-small-binaries
 * >= 2.1.1) decompresses before counting. A pre-1.1.1 binary reads the gzip
 * bytes raw and returns a wrong (tiny) count — so this guards the dependency
 * bump, not just the SDK code.
 */
tplTest.concurrent(
  "formula-gz: UPPERCASE .GZ input decompressed and line-counted, ram = 512MiB + 5*1024, cpu = 2",
  async ({ helper, expect, driverKit }) => {
    const handle = await libraryFileHandle(driverKit, GZ_FIXTURE_NAME);

    const result = await helper.renderTemplate(false, "exec.run.formula_gz", ["limits"], (tx) => ({
      file: tx.createValue(Pl.JsonObject, JSON.stringify(handle)),
    }));

    const limits = await result
      .computeOutput("limits", (a) => a?.getDataAsString())
      .awaitStableValue();

    expect(limits).toBeDefined();
    const [ramStr, cpuStr] = limits!.split(",");
    const expectedRam = 512 * MIB + GZ_FIXTURE_LINES * 1024;
    // eslint-disable-next-line no-console
    console.log(
      `[formula-gz] ram=${ramStr} cpu=${cpuStr} | expected ram=${expectedRam} (512MiB + ${GZ_FIXTURE_LINES}*1024) cpu=2`,
    );

    expect(Number(ramStr)).eq(expectedRam);
    expect(Number(cpuStr)).eq(2);
  },
  120000,
);
