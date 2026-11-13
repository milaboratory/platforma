import { Pl } from "@milaboratories/pl-middle-layer";
import type { TestRenderResults, TplTestHelpers } from "@platforma-sdk/test";
import { tplTest } from "@platforma-sdk/test";
import type { ExpectStatic } from "vitest";
import { randomUUID } from "node:crypto";
import { getLongTestTimeout } from "@milaboratories/test-helpers";

/**
 * A failed computation must keep its inputs, so a retry re-runs only the step that
 * failed.
 *
 * In every scenario the upstream command succeeds and writes a run marker: the current
 * time in seconds plus 8 random bytes, unique to that execution. A later step fails and
 * carries the marker in its error message. The template is rendered twice with the
 * same seed. If the retry recovered the upstream result, both errors carry the same
 * marker; if it re-ran the command, the markers differ.
 *
 * The upstream result is never a template output: an output would hold it from GC on
 * its own, and the markers would match without the backend doing anything.
 */

// Epoch seconds, a dash, 16 hex digits of randomness. The random part is what makes a
// re-run distinguishable: seconds alone could repeat on a fast retry.
const MARKER_PATTERN = /stage1-run=(\d+-[0-9a-f]{16})\b/;

async function renderAndAwaitError(
  helper: TplTestHelpers,
  template: string,
  seed: string,
): Promise<unknown> {
  const result: TestRenderResults<"main"> = await helper.renderTemplate(
    false,
    template,
    ["main"],
    (tx) => ({
      seed: tx.createValue(Pl.JsonObject, JSON.stringify(seed)),
    }),
  );
  return await result
    .computeOutput("main", (a) => a?.getDataAsString())
    .awaitStableValue()
    .catch((e: unknown) => e);
}

function upstreamMarker(expect: ExpectStatic, err: unknown, errorFragment: string): string {
  expect(err).toBeInstanceOf(Error);
  const message = err instanceof Error ? err.message : "";
  expect(message).toContain(errorFragment);
  const match = MARKER_PATTERN.exec(message);
  expect(match, `no stage1-run marker in the error message:\n${message}`).not.toBeNull();
  return match?.[1] ?? "";
}

/**
 * One scenario: render `template` twice with the same seed, expect the same error both
 * times, and require the upstream run marker to be identical.
 *
 * The seed is random per scenario run, so neither scenarios sharing an upstream command
 * nor a rerun against the same backend can recover a result left by an earlier run and
 * pass without the first render having executed the command.
 */
async function runRecoveryScenario(
  helper: TplTestHelpers,
  expect: ExpectStatic,
  opts: { template: string; errorFragment: string },
): Promise<void> {
  const seed = randomUUID();
  const firstErr = await renderAndAwaitError(helper, opts.template, seed);
  const firstMarker = upstreamMarker(expect, firstErr, opts.errorFragment);

  const secondErr = await renderAndAwaitError(helper, opts.template, seed);
  const secondMarker = upstreamMarker(expect, secondErr, opts.errorFragment);

  expect(secondMarker, "the retry re-ran the upstream command").toBe(firstMarker);
}

tplTest(
  "failing exec keeps the upstream result, so a retry does not re-run it",
  async ({ helper, expect }) => {
    await runRecoveryScenario(helper, expect, {
      template: "exec.run.two_execs_second_fails",
      errorFragment: "stage2 died on purpose",
    });
  },
  getLongTestTimeout(60_000),
);

tplTest(
  "nested templates: exec fails in the deepest one",
  async ({ helper, expect }) => {
    await runRecoveryScenario(helper, expect, {
      template: "exec.run.nested_outer_exec_fails",
      errorFragment: "stage2 died on purpose",
    });
  },
  getLongTestTimeout(60_000),
);

tplTest(
  "nested templates: exec succeeds and an intermediate template throws",
  async ({ helper, expect }) => {
    await runRecoveryScenario(helper, expect, {
      template: "exec.run.nested_outer_mid_throws",
      errorFragment: "intermediate template failed on purpose",
    });
  },
  getLongTestTimeout(60_000),
);
