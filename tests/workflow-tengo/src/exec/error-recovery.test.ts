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
 * In every scenario the upstream command succeeds and writes the current time in
 * nanoseconds; a later step fails and carries that timestamp in its error message.
 * The template is rendered twice with the same seed. If the retry recovered the
 * upstream result, both errors carry the same timestamp; if it re-ran the command,
 * the timestamps differ.
 *
 * The upstream result is never a template output: an output would hold it from GC on
 * its own, and the timestamps would match without the backend doing anything.
 */

// A nanosecond epoch has 19 digits. Fewer means `date` ignored %N and printed whole
// seconds, which a fast retry could repeat without recovering anything.
const TIME_PATTERN = /stage1-time=(\d{19,})\b/;

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

function upstreamTime(expect: ExpectStatic, err: unknown, errorFragment: string): string {
  expect(err).toBeInstanceOf(Error);
  const message = err instanceof Error ? err.message : "";
  expect(message).toContain(errorFragment);
  const match = TIME_PATTERN.exec(message);
  expect(match, `no nanosecond stage1-time in the error message:\n${message}`).not.toBeNull();
  return match?.[1] ?? "";
}

/**
 * One scenario: render `template` twice with the same seed, expect the same error both
 * times, and require the upstream timestamp to be identical.
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
  const firstTime = upstreamTime(expect, firstErr, opts.errorFragment);

  const secondErr = await renderAndAwaitError(helper, opts.template, seed);
  const secondTime = upstreamTime(expect, secondErr, opts.errorFragment);

  expect(secondTime, "the retry re-ran the upstream command").toBe(firstTime);
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
