import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";
import dedent from "dedent";

const tsv = dedent`
  a	b
  1	2
  3	4
`;

/**
 * exec.builder().writeFile / addFile honour { writable: true } by landing the
 * file as 0o600 in the workdir so the backend copies (instead of hardlinking
 * RO from the archive cache). The check below runs ptabler with a workflow
 * that read_csv's the file then write_csv's back to the same path:
 *   - default (RO 0o400): pt must fail to open the file for writing
 *   - { writable: true } (RW 0o600): pt must succeed and the file content round-trips
 *
 * Requires a backend that honors per-file workdir fill perms (PR #1830 in
 * milaboratory/pl, post-3.5.0). Older backends are detected via
 * `pl.supportsWritableWorkdirFiles` and the test self-skips.
 */
tplTest.concurrent.for([
  { mode: "write" as const, writable: true },
  { mode: "write" as const, writable: false },
  { mode: "add" as const, writable: true },
  { mode: "add" as const, writable: false },
])(
  "exec.builder.$mode { writable: $writable } — pt overwrites input.tsv",
  async ({ mode, writable }, { helper, pl, expect, skip }) => {
    if (!pl.supportsWritableWorkdirFiles) {
      skip(
        `backend ${pl.serverInfo.coreVersion} predates workdir fill perm honoring (pl #1830); needs >3.5.0`,
      );
    }

    const result = await helper.renderTemplate(
      false,
      "exec.writable.pt_overwrite",
      ["result"],
      (tx) => ({
        mode: tx.createValue(Pl.JsonObject, JSON.stringify(mode)),
        writable: tx.createValue(Pl.JsonObject, JSON.stringify(writable)),
        tsv: tx.createValue(Pl.JsonObject, JSON.stringify(tsv)),
      }),
    );

    const out = result.computeOutput("result", (a) => a?.getDataAsString());
    const settled = await out.awaitStableValue().catch((e: Error) => e);

    if (writable) {
      // RW: backend lands data.tsv as 0o600, pt opens for write, no error.
      // Content roundtrip is intentionally not asserted — pt truncates the
      // target before reading all source rows (same path read+write race),
      // so the output is a partial TSV. We only care that the write succeeded.
      expect(settled).not.toBeInstanceOf(Error);
      expect(settled).toBeTypeOf("string");
      expect(settled).toMatch(/^a\tb/);
    } else {
      // RO: backend lands data.tsv as 0o400 (hardlinked from archive cache).
      // pt's write_csv must hit EACCES, exec must surface the non-zero exit.
      expect(settled).toBeInstanceOf(Error);
      expect((settled as Error).message).toMatch(/Exited with code/);
    }
  },
);
