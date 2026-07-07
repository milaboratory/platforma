import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";
import * as env from "../env";

/**
 * End-to-end proof that resource formulas (RAM / CPU) are
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

// Zstd fixture (decompresses to 7 newlines) — proves the line-counter handles
// the zstd codec too; only .gz was proven end-to-end before.
const ZST_FIXTURE_NAME = "formula_zst_7lines.fastq.zst";
const ZST_FIXTURE_LINES = 7;

// Bzip2 fixture (decompresses to 6 newlines). bz2 is an advertised codec
// (formula.lib _COMPRESSION_EXT) but was the only one with no e2e proof;
// added by the review. Verified the shipped line-counter binary (1.1.1) decodes
// it (.bz2 and .BZ2 → 6).
const BZ2_FIXTURE_NAME = "formula_bz2_6lines.fastq.bz2";
const BZ2_FIXTURE_LINES = 6;

// Single line with NO trailing newline => the line-counter reports 0 newlines.
const NO_NEWLINE_FIXTURE_NAME = "formula_no_newline.txt";

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
 *               map + the impl's wildcard await), and .dividedBy (ceil) rounds up.
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
    // cpu = ceil(2*lineCount / 50); ceiling of 84/50 = 2 (truncating div = 1).
    // Robust to a ±1 newline-vs-line ambiguity in the counter: ceil(86/50)=2 too.
    desc: "ram = 1GiB + 2*fileSize, cpu = ceil(2*lineCount / 50) (multi-file aggregation)",
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
 *   formula_ops   — non-arithmetic ops (.between, comparison, conditional) evaluate
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
    desc: "ram = 4GiB (.between caps 8GiB→4GiB), cpu = 2 (.when/.gt selects)",
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
 * Compressed lineCount input, end-to-end. Each fixture is compressed and added
 * under a name carrying the codec suffix; the count is right only if TWO things
 * line up: the SDK strips the compression suffix to accept lineCount, AND the
 * wired line-counter binary (>= 1.1.1, via software-small-binaries >= 2.1.1)
 * decompresses before counting. A pre-1.1.1 binary reads the compressed bytes
 * raw and returns a wrong (tiny) count — so these guard the dependency bump, not
 * just the SDK code.
 *
 *   .GZ  — UPPERCASE suffix also exercises case-insensitive suffix stripping.
 *   .zst — covers the zstd codec (previously only gzip was proven end-to-end).
 */
const compressedCases = [
  {
    template: "exec.run.formula_gz",
    fixture: GZ_FIXTURE_NAME,
    lines: GZ_FIXTURE_LINES,
    label: "UPPERCASE .GZ",
  },
  {
    template: "exec.run.formula_zst",
    fixture: ZST_FIXTURE_NAME,
    lines: ZST_FIXTURE_LINES,
    label: ".zst",
  },
  {
    template: "exec.run.formula_bz2",
    fixture: BZ2_FIXTURE_NAME,
    lines: BZ2_FIXTURE_LINES,
    label: ".bz2",
  },
] as const;

for (const tc of compressedCases) {
  tplTest.concurrent(
    `formula-compressed ${tc.label}: decompressed + line-counted, ram = 512MiB + ${tc.lines}*1024, cpu = 2`,
    async ({ helper, expect, driverKit }) => {
      const handle = await libraryFileHandle(driverKit, tc.fixture);

      const result = await helper.renderTemplate(false, tc.template, ["limits"], (tx) => ({
        file: tx.createValue(Pl.JsonObject, JSON.stringify(handle)),
      }));

      const limits = await result
        .computeOutput("limits", (a) => a?.getDataAsString())
        .awaitStableValue();

      expect(limits).toBeDefined();
      const [ramStr, cpuStr] = limits!.split(",");
      const expectedRam = 512 * MIB + tc.lines * 1024;
      // eslint-disable-next-line no-console
      console.log(
        `[formula-compressed ${tc.label}] ram=${ramStr} cpu=${cpuStr} | expected ram=${expectedRam} (512MiB + ${tc.lines}*1024) cpu=2`,
      );

      expect(Number(ramStr)).eq(expectedRam);
      expect(Number(cpuStr)).eq(2);
    },
    120000,
  );
}

/**
 * Zero-newline edge. A file whose only line has NO trailing newline reports
 * lineCount 0 (the counter counts '\n' bytes). Reuses formula_limits in
 * `lineCount` mode (ram = 512MiB + lineCount*1024): the metric contributes 0, so
 * ram must be exactly the 512MiB floor. Proves (a) a 0 metric does not trip the
 * positive-integer result guard once floored, and (b) the counter's "0" output
 * parses cleanly into the sum.
 */
tplTest.concurrent(
  "formula-zero-lineCount: 0 newlines => ram = 512MiB (floor holds), cpu = 2",
  async ({ helper, expect, driverKit }) => {
    const handle = await libraryFileHandle(driverKit, NO_NEWLINE_FIXTURE_NAME);

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
    const expectedRam = 512 * MIB; // 512MiB + 0*1024
    // eslint-disable-next-line no-console
    console.log(
      `[formula-zero-lineCount] ram=${ramStr} cpu=${cpuStr} | expected ram=${expectedRam} cpu=2`,
    );

    expect(Number(ramStr)).eq(expectedRam);
    expect(Number(cpuStr)).eq(2);
  },
  120000,
);

/**
 * Negative-path cases — added by the deep-dive review (2026-06-03).
 *
 * The positive-integer result guard and the lineCount format-compatibility
 * guard previously had NO automated coverage: the Tengo unit layer cannot
 * reach them (ll.assert is terminal — no try/catch), and no e2e case exercised a
 * rejection. Each case renders exec.run.formula_reject in a `mode` whose formula
 * must be rejected, and asserts the render REJECTS with the guard's message — and,
 * for the positive-integer guard, that the message names the offending dimension (ram / cpu). The regex
 * checks dimension + phrase together (the message is "...(ram) must evaluate to a
 * positive integer...").
 */
const rejectCases = [
  {
    mode: "negative",
    needsFile: false,
    pattern: /\(ram\) must evaluate to a positive integer/, // result underflows to negative (.minus)
    desc: "RAM formula underflow (negative) rejected, names ram",
  },
  {
    mode: "zero",
    needsFile: false,
    pattern: /\(ram\) must evaluate to a positive integer/, // result is an unfloored 0
    desc: "RAM formula = 0 (unfloored) rejected, names ram",
  },
  {
    mode: "boolCpu",
    needsFile: false,
    pattern: /\(cpu\) must compute a number/, // top-level comparison rejected structurally
    desc: "CPU formula = comparison (bool) rejected, names cpu",
  },
  {
    mode: "bam",
    needsFile: true,
    pattern: /lineCount is not supported for file/, // unsupported lineCount format, rejected at workflow render time
    desc: "f.lineCount() on a .bam file rejected at workflow render time",
  },
  {
    mode: "gpuRequired",
    needsFile: false,
    pattern: /no GPU support/, // onGPU without onCPU on a GPU-less backend -> fail fast at workflow render time
    desc: "resources({ onGPU }) alone fails fast on a GPU-less backend",
  },
] as const;

for (const tc of rejectCases) {
  tplTest.concurrent(
    `formula-reject ${tc.mode}: ${tc.desc}`,
    async ({ helper, expect, driverKit }) => {
      const handle = tc.needsFile ? await libraryFileHandle(driverKit) : undefined;

      // The render must fail. Positive-integer-guard rejections surface at run time,
      // when the awaited output resolves (the ephemeral impl panics in
      // evaluateResource); the format guard and the GPU-required guard fail the
      // render directly (a workflow-render-time assert). Wrapping render + await in
      // one thunk catches both timings.
      await expect(async () => {
        const result = await helper.renderTemplate(
          false,
          "exec.run.formula_reject",
          ["limits"],
          (tx) => {
            const ins: Record<string, ReturnType<typeof tx.createValue>> = {
              mode: tx.createValue(Pl.JsonObject, JSON.stringify(tc.mode)),
            };
            if (tc.needsFile && handle !== undefined) {
              ins.file = tx.createValue(Pl.JsonObject, JSON.stringify(handle));
            }
            return ins;
          },
        );
        await result.computeOutput("limits", (a) => a?.getDataAsString()).awaitStableValue();
      }).rejects.toThrow(tc.pattern);
    },
    120000,
  );
}

/**
 * Formula CID-transparency direct proof. The resolved formula ASTs ride the META
 * input rail, so they are EXCLUDED from the exec CID. Render the SAME exec twice
 * (identical software/arg/no files), differing ONLY in the RAM formula value
 * (2 GiB vs 4 GiB). Because the formula does NOT affect the CID, the two renders
 * share one CID and dedup to a single allocation: the memGib=4 render dedups to
 * the memGib=2 render, so BOTH read back 2 GiB. (If the formula ever leaked into
 * the CID — e.g. by riding the regular rail — the two would allocate separately
 * and diverge to 2 vs 4.) Only computed metric maps ride the regular rail, and
 * those are file-derived, so the formula itself stays transparent — see the
 * analysis doc §4. This harness dedups across renders; formula_cid uses a
 * constant ",cid" arg suffix so the two renders differ ONLY by formula.
 */
tplTest.concurrent(
  "formula-cid-transparent: changing the RAM formula dedups to one allocation",
  async ({ helper, expect }) => {
    const readRam = async (memGib: number) => {
      const result = await helper.renderTemplate(
        false,
        "exec.run.formula_cid",
        ["limits"],
        (tx) => ({
          memGib: tx.createValue(Pl.JsonObject, JSON.stringify(memGib)),
        }),
      );
      const out = await result
        .computeOutput("limits", (a) => a?.getDataAsString())
        .awaitStableValue();
      return Number(out!.split(",")[0]);
    };

    const ram2 = await readRam(2); // memGib=2 render allocates 2 GiB
    const ram4 = await readRam(4); // formula is CID-excluded => dedups to the 2 GiB render
    // eslint-disable-next-line no-console
    console.log(
      `[formula-cid] ram(memGib=2)=${ram2} ram(memGib=4)=${ram4} (equal => formula is CID-transparent)`,
    );

    expect(ram2).eq(2 * GIB);
    expect(ram4).eq(2 * GIB); // formula is CID-excluded: the second exec dedups to the first
  },
  120000,
);

/**
 * Formula CID-transparency across metric kinds. For each metric, render the SAME
 * exec twice over the SAME file, varying ONLY the formula's +delta GiB. The
 * metric reads the same file, so the regular-rail inputs are identical and the
 * formula AST (meta) is CID-excluded => the delta=2 render dedups to the delta=1
 * render and both read back metric + 1 GiB. This proves transparency holds even
 * for lineCount, whose computed (regular-rail) map is file-derived. See §4.
 */
const transparencyCases = [
  { mode: "size", metric: FIXTURE_BYTES, label: "size" },
  { mode: "lineCount", metric: FIXTURE_NEWLINES * 1024, label: "lineCount" },
] as const;

for (const tc of transparencyCases) {
  tplTest.concurrent(
    `formula-cid-transparent ${tc.label}: changing only the formula delta dedups to one allocation`,
    async ({ helper, expect, driverKit }) => {
      const handle = await libraryFileHandle(driverKit);
      const readRam = async (deltaGib: number) => {
        const result = await helper.renderTemplate(
          false,
          "exec.run.formula_cid_metric",
          ["limits"],
          (tx) => ({
            file: tx.createValue(Pl.JsonObject, JSON.stringify(handle)),
            mode: tx.createValue(Pl.JsonObject, JSON.stringify(tc.mode)),
            deltaGib: tx.createValue(Pl.JsonObject, JSON.stringify(deltaGib)),
          }),
        );
        const out = await result
          .computeOutput("limits", (a) => a?.getDataAsString())
          .awaitStableValue();
        return Number(out!.split(",")[0]);
      };
      const ram1 = await readRam(1); // metric + 1 GiB
      const ram2 = await readRam(2); // formula is CID-excluded => dedups to the delta=1 render
      // eslint-disable-next-line no-console
      console.log(`[formula-cid ${tc.label}] ram(delta=1)=${ram1} ram(delta=2)=${ram2}`);
      expect(ram1).eq(tc.metric + 1 * GIB);
      expect(ram2).eq(tc.metric + 1 * GIB); // deduped: NOT metric + 2 GiB
    },
    120000,
  );
}

/**
 * CID boundary: measuring a DIFFERENT file changes the allocation. Both files are
 * added to every render, so the regular file inputs are identical; only the
 * formula's lineCount(tag) selects which file's (regular-rail, file-derived)
 * count enters the CID. Tag "a" (42 newlines) and tag "b" (0 newlines) therefore
 * produce DISTINCT line-count maps => distinct CIDs => distinct allocations. This
 * is the intended limit of the hybrid's transparency. See §4.
 */
tplTest.concurrent(
  "formula-cid boundary: measuring a different file changes the allocation",
  async ({ helper, expect, driverKit }) => {
    const handleA = await libraryFileHandle(driverKit, FIXTURE_NAME); // 42 newlines
    const handleB = await libraryFileHandle(driverKit, NO_NEWLINE_FIXTURE_NAME); // 0 newlines
    const readRam = async (whichTag: "a" | "b") => {
      const result = await helper.renderTemplate(
        false,
        "exec.run.formula_cid_files",
        ["limits"],
        (tx) => ({
          fileA: tx.createValue(Pl.JsonObject, JSON.stringify(handleA)),
          fileB: tx.createValue(Pl.JsonObject, JSON.stringify(handleB)),
          whichTag: tx.createValue(Pl.JsonObject, JSON.stringify(whichTag)),
        }),
      );
      const out = await result
        .computeOutput("limits", (a) => a?.getDataAsString())
        .awaitStableValue();
      return Number(out!.split(",")[0]);
    };
    const ramA = await readRam("a"); // 512 MiB + 42*1024
    const ramB = await readRam("b"); // 512 MiB + 0  => distinct CID => distinct allocation
    // eslint-disable-next-line no-console
    console.log(`[formula-cid boundary] ram(a)=${ramA} ram(b)=${ramB}`);
    expect(ramA).eq(512 * MIB + FIXTURE_NEWLINES * 1024);
    expect(ramB).eq(512 * MIB);
    expect(ramA).not.eq(ramB); // measuring different files differentiates (intended)
  },
  120000,
);
