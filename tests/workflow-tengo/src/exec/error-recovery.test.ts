import { Pl, resourceIdToString } from "@milaboratories/pl-middle-layer";
import type { SignedResourceId } from "@milaboratories/pl-middle-layer";
import type { TestRenderResults, TplTestHelpers } from "@platforma-sdk/test";
import { tplTest } from "@platforma-sdk/test";
import type { ExpectStatic } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * A failed computation must keep its inputs, so a retry re-runs only the
 * step that failed.
 *
 * The chain is `exec.run.two_execs_second_fails`: stage 1 succeeds and writes a file,
 * stage 2 consumes it and exits 42. Rendering the same template twice with identical
 * inputs must not re-run stage 1 the second time -- its result has to survive the
 * error and be recovered by CID.
 *
 * The test also prints the resource tree at three points so the exact set of held
 * resources is visible, which is what decides whether an unbounded hold is acceptable.
 */

const TEMPLATE = "exec.run.two_execs_second_fails";

// The debug API is enabled on the monorepo-test backend
// (--debug-enabled --debug-port=9091, see pl/.github/workflows/test.yaml).
function debugEndpoint(): string {
  if (process.env.PL_DEBUG_ENDPOINT) return process.env.PL_DEBUG_ENDPOINT;
  const addr = process.env.PL_ADDRESS ?? "http://localhost:6345";
  const host = addr.replace(/^\w+:\/\//, "").split(":")[0];
  return `http://${host}:9091`;
}

type TreeField = {
  ID: string;
  Type: string;
  IsFinal: boolean;
  TreeTruncated?: boolean;
  FieldRef?: TreeField;
  ResourceRef?: TreeResource;
  Error?: TreeResource;
  State?: Record<string, unknown>;
};

type TreeResource = {
  ID: string;
  Type: string;
  Data?: unknown;
  Fields: Record<string, TreeField>;
  State?: { resourceStateBody?: Record<string, unknown> };
};

async function fetchTree(rid: SignedResourceId, depth = 20): Promise<TreeResource | undefined> {
  const id = resourceIdToString(rid);
  const url =
    `${debugEndpoint()}/db/resource/tree` +
    `?id=${encodeURIComponent(id)}&depth=${depth}&truncateData=256&dumpStates=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`[recovery] tree dump unavailable: HTTP ${res.status} for ${id}`);
      return undefined;
    }
    return (await res.json()) as TreeResource;
  } catch (e) {
    console.log(`[recovery] tree dump unavailable (${String(e)}). Is --debug-enabled set?`);
    return undefined;
  }
}

/** Whether the debug API is reachable at all. */
async function debugApiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${debugEndpoint()}/db/stats`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Existence check for one resource, independent of reachability from any root. */
async function resourceExists(id: string): Promise<boolean> {
  const url =
    `${debugEndpoint()}/db/resource/tree` +
    `?id=${encodeURIComponent(id)}&depth=0&truncateData=0`;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const body = (await res.json()) as { ID?: string; error?: string };
    return typeof body.ID === "string" && body.error === undefined;
  } catch {
    return false;
  }
}

type TreeFacts = {
  /** every resource id reachable from the root */
  resourceIds: Set<string>;
  /** resources reached through a field the engine marked as recovered */
  recovered: string[];
  /** resources held by an error trace purely to enable a retry */
  heldForRecovery: { field: string; resource: string; type: string }[];
  text: string;
};

const RECOVERY_PREFIX = "recovery/";

/** Renders the tree as text and collects the facts the assertions need. */
function walkTree(root: TreeResource): TreeFacts {
  const facts: TreeFacts = {
    resourceIds: new Set(),
    recovered: [],
    heldForRecovery: [],
    text: "",
  };
  const lines: string[] = [];
  const seen = new Map<string, number>();

  const isNoise = (name: string) =>
    /^(lib|asset|soft(ware)?)\//.test(name) || name.includes("@platforma-sdk/workflow-tengo:");

  const resource = (res: TreeResource, prefix: string) => {
    facts.resourceIds.add(res.ID);
    const entries = Object.entries(res.Fields ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const kept = entries.filter(([name]) => !isNoise(name));
    const folded = entries.length - kept.length;

    kept.forEach(([name, f], i) => {
      const last = i === kept.length - 1 && folded === 0;
      const branch = prefix + (last ? "`-- " : "|-- ");
      const childPrefix = prefix + (last ? "    " : "|   ");
      field(name, f, branch, childPrefix);
    });
    if (folded > 0) {
      lines.push(`${prefix}\`-- ... ${folded} SDK library/software edge(s) folded`);
    }
  };

  const field = (name: string, f: TreeField, branch: string, childPrefix: string) => {
    // Follow a field-to-field reference chain to whatever it finally points at.
    let node = f;
    let hops = 0;
    const chain: string[] = [];
    while (node.FieldRef && hops++ < 64) {
      node = node.FieldRef;
      chain.push(node.ID);
    }

    const st = node.State ?? f.State;
    const isRecovered = st?.valueIsRecovered === true;
    const label = name + (chain.length ? ` => ${chain[chain.length - 1]}` : "");

    const err = node.Error ?? f.Error;
    const ref = node.ResourceRef;

    if (err) {
      lines.push(`${branch}${label} !! error -> ${err.Type} ${err.ID}`);
      resource(err, childPrefix);
      // An errored field can still carry a value; keep walking it, otherwise the dump
      // shows only the error spine and none of the resources actually held.
      if (ref) {
        lines.push(`${childPrefix}\`-- (value) -> ${ref.Type} ${ref.ID}`);
        if (!seen.has(ref.ID)) {
          seen.set(ref.ID, lines.length);
          resource(ref, childPrefix + "    ");
        }
        facts.resourceIds.add(ref.ID);
      }
      return;
    }
    if (node.TreeTruncated ?? f.TreeTruncated) {
      lines.push(`${branch}${label} -> ... truncated`);
      return;
    }
    if (!ref) {
      lines.push(`${branch}${label} (empty)`);
      return;
    }

    if (isRecovered) facts.recovered.push(ref.ID);
    if (name.startsWith(RECOVERY_PREFIX)) {
      facts.heldForRecovery.push({ field: name, resource: ref.ID, type: ref.Type });
    }

    const marks = [isRecovered ? "RECOVERED" : "", name.startsWith(RECOVERY_PREFIX) ? "HELD" : ""]
      .filter(Boolean)
      .join(" ");
    const suffix = marks ? `  [${marks}]` : "";

    const already = seen.get(ref.ID);
    if (already !== undefined) {
      lines.push(`${branch}${label} -> ${ref.Type} ${ref.ID}${suffix}  (*) see line ${already}`);
      facts.resourceIds.add(ref.ID);
      return;
    }
    lines.push(`${branch}${label} -> ${ref.Type} ${ref.ID}${suffix}`);
    seen.set(ref.ID, lines.length);
    resource(ref, childPrefix);
  };

  lines.push(`${root.Type} ${root.ID}`);
  seen.set(root.ID, 1);
  resource(root, "");
  facts.text = lines.join("\n");
  return facts;
}

async function dump(label: string, rid: SignedResourceId): Promise<TreeFacts | undefined> {
  const tree = await fetchTree(rid);
  if (!tree) return undefined;
  const facts = walkTree(tree);
  console.log(
    `\n===== [recovery] TREE ${label} =====\n${facts.text}\n` +
      `----- ${facts.resourceIds.size} unique resources, ` +
      `${facts.heldForRecovery.length} held for recovery, ` +
      `${facts.recovered.length} recovered field(s) -----\n`,
  );
  return facts;
}

/**
 * One scenario: render `template` twice with identical inputs, expect the same error
 * both times, and require that everything the first failure held is still alive after
 * the retry. That is what "the upstream step was not recomputed" looks like from the
 * resource tree.
 *
 * `commandName` is only reported, not asserted: counting actual command executions
 * needs the backend log, which the test cannot read portably. The held-resource
 * survival check is the in-test proxy.
 */
async function runRecoveryScenario(
  helper: TplTestHelpers,
  expect: ExpectStatic,
  skip: (note?: string) => void,
  opts: { label: string; template: string; errorFragment: string },
): Promise<void> {
  // Every meaningful assertion below reads the resource tree over the debug API. Where
  // it is absent the scenario has nothing to check, so report it as skipped rather
  // than let it pass on the strength of the two error assertions alone.
  if (!(await debugApiAvailable())) {
    skip(
      `debug API unreachable at ${debugEndpoint()}; run the backend with --debug-enabled ` +
        "or set PL_DEBUG_ENDPOINT",
    );
    return;
  }

  const payload = `recovery-${randomUUID()}`;
  const render = () =>
    helper.renderTemplate(false, opts.template, ["main"], (tx) => ({
      payload: tx.createValue(Pl.JsonObject, JSON.stringify(payload)),
    }));

  const awaitError = async (r: TestRenderResults<"main">) =>
    await r
      .computeOutput("main", (a) => a?.getDataAsString())
      .awaitStableValue()
      .catch((e: Error) => e);

  // ---- first run -----------------------------------------------------------
  const first = await render();
  const firstErr = await awaitError(first);
  expect(firstErr).toBeInstanceOf(Error);
  expect((firstErr as Error).message).toContain(opts.errorFragment);

  const afterError = await dump(`${opts.label} :: AFTER ERROR`, first.resultEntry.rid);

  // ---- second run, identical inputs ---------------------------------------
  const second = await render();
  const secondErr = await awaitError(second);
  expect(secondErr).toBeInstanceOf(Error);
  expect((secondErr as Error).message).toContain(opts.errorFragment);

  const afterSecond = await dump(`${opts.label} :: AFTER SECOND CALL`, second.resultEntry.rid);

  // Availability was checked up front, so a missing dump here means the endpoint died
  // mid-scenario. That is a real problem, not a reason to pass.
  expect(afterError, "tree dump after the first failure").toBeDefined();
  expect(afterSecond, "tree dump after the retry").toBeDefined();
  if (!afterError || !afterSecond) return;

  console.log(
    `\n===== [recovery] ${opts.label}: HELD FOR RECOVERY (${afterError.heldForRecovery.length}) =====`,
  );
  for (const h of afterError.heldForRecovery) {
    console.log(`  ${h.field}  ->  ${h.type}  ${h.resource}`);
  }

  // The feature must hold something, and it must hold at a deduplicated resource --
  // an ephemeral one has no stable CID and could never be recovered.
  expect(afterError.heldForRecovery.length).toBeGreaterThan(0);

  // Checked by direct lookup, not reachability: the retry renders under its own root,
  // so a surviving resource is not necessarily inside that root's subtree.
  const heldIds = [...new Set(afterError.heldForRecovery.map((h) => h.resource))];
  const alive = (await Promise.all(heldIds.map((id) => resourceExists(id))))
    .map((ok, i) => (ok ? heldIds[i] : undefined))
    .filter((id): id is string => id !== undefined);
  console.log(
    `\n===== [recovery] ${opts.label}: HELD RESOURCES STILL ALIVE AFTER RETRY =====\n` +
      `${alive.length}/${heldIds.length}: ${alive.join(", ")}\n`,
  );
  expect(alive.length).toBe(heldIds.length);
}

tplTest(
  "failing exec keeps the upstream result, so a retry does not re-run it",
  async ({ helper, expect, skip }) => {
    await runRecoveryScenario(helper, expect, skip, {
      label: "flat",
      template: "exec.run.two_execs_second_fails",
      errorFragment: "stage2 died on purpose",
    });
  },
);

tplTest(
  "nested templates: exec fails in the deepest one",
  async ({ helper, expect, skip }) => {
    await runRecoveryScenario(helper, expect, skip, {
      label: "nested-exec-fails",
      template: "exec.run.nested_outer_exec_fails",
      errorFragment: "stage2 died on purpose",
    });
  },
);

tplTest(
  "nested templates: exec succeeds and an intermediate template throws",
  async ({ helper, expect, skip }) => {
    await runRecoveryScenario(helper, expect, skip, {
      label: "nested-mid-throws",
      template: "exec.run.nested_outer_mid_throws",
      errorFragment: "intermediate template failed on purpose",
    });
  },
);
