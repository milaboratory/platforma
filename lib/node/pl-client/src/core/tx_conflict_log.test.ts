import type { MiLogger } from "@milaboratories/ts-helpers";
import { expect, test } from "vitest";
import { initialTxStat } from "./stat";
import type { TxConflict } from "./tx_conflict_log";
import { formatTxConflict, TxConflictLog } from "./tx_conflict_log";

function conflict(patch: Partial<TxConflict>): TxConflict {
  return {
    name: "ProjectAction: mutate-block-storage",
    lockId: "project-1",
    attempt: 1,
    maxAttempts: 10,
    nextDelay: 50,
    stat: { ...initialTxStat(), txCount: 1, timeMs: 12, fieldsSet: 3 },
    ...patch,
  };
}

function setup() {
  const warnings: string[] = [];
  const logger: MiLogger = {
    info: () => {},
    warn: (msg) => warnings.push(String(msg)),
    error: () => {},
  };
  let now = 0;
  const log = new TxConflictLog(logger, { windowMs: 1000, maxNames: 16, now: () => now });
  return {
    warnings,
    log,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("a conflict warning names the transaction, its lock, the attempt and the work done", () => {
  expect(formatTxConflict(conflict({ attempt: 2, nextDelay: 37.6 }), 0)).toBe(
    'tx commit conflict: name="ProjectAction: mutate-block-storage" lockId=project-1 ' +
      'attempt=2/10 nextDelay=38ms stat={"txCount":1,"fieldsSet":3,"timeMs":12}',
  );
});

test("a conflict without an advisory lock and with suppressed predecessors says so", () => {
  expect(formatTxConflict(conflict({ lockId: undefined }), 4)).toContain(
    "lockId=none attempt=1/10 nextDelay=50ms suppressed=4 ",
  );
});

test("the first conflict of a name warns, repeats inside the window are counted", () => {
  const { warnings, log, advance } = setup();

  log.record(conflict({ attempt: 1 }));
  advance(100);
  log.record(conflict({ attempt: 2 }));
  log.record(conflict({ attempt: 3 }));
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("attempt=1/10");

  advance(1000);
  log.record(conflict({ attempt: 4 }));
  expect(warnings).toHaveLength(2);
  expect(warnings[1]).toContain("attempt=4/10");
  expect(warnings[1]).toContain("suppressed=2");

  advance(1000);
  log.record(conflict({ attempt: 5 }));
  expect(warnings).toHaveLength(3);
  expect(warnings[2]).not.toContain("suppressed=");
});

test("each transaction name has its own window", () => {
  const { warnings, log } = setup();

  log.record(conflict({ name: "Refresh" }));
  log.record(conflict({ name: "ProjectAction: setBlockSettings" }));
  log.record(conflict({ name: "Refresh" }));

  expect(warnings).toHaveLength(2);
  expect(warnings[0]).toContain('name="Refresh"');
  expect(warnings[1]).toContain('name="ProjectAction: setBlockSettings"');
});
