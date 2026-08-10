import { describe, expect, test } from "vitest";
import { KindResolutionError } from "@platforma-sdk/block-tools";
import type {
  BlockPackFromRegistryV2,
  BlockPackId,
  RegistryEntry,
  SingleBlockPackOverview,
} from "@milaboratories/pl-model-middle-layer";
import type { BlockKindSelectorReference } from "@milaboratories/pl-model-common";
import type { MiLogger } from "@milaboratories/ts-helpers";
import type { KindAwareRegistry } from "./template_provider";
import { kindCapableRegistryIds, templateBlockPackProvider } from "./template_provider";

/**
 * The registry-backed provider, driven against a fake registry.
 *
 * Everything specific to this adapter is in what it does with two registry answers:
 * which registries it asks, in what order, which failure it reports when they disagree,
 * and where the block's title comes from. None of that needs a registry to check.
 */

const KIND = "@platforma-open/milaboratories.demo.kind@^1.0.0" as BlockKindSelectorReference;

const blockId = (name: string, version = "1.2.3"): BlockPackId => ({
  organization: "milaboratories",
  name,
  version,
});

const specIn = (registryUrl: string, id: BlockPackId): BlockPackFromRegistryV2 => ({
  type: "from-registry-v2",
  registryUrl,
  id,
  channel: "stable",
});

const overviewOf = (registryUrl: string, id: BlockPackId, title: string): SingleBlockPackOverview =>
  ({ id, meta: { title }, spec: specIn(registryUrl, id) }) as unknown as SingleBlockPackOverview;

const silent: MiLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as MiLogger;

/**
 * A registry whose per-registry answers are scripted.
 *
 * @param answers Keyed by registry id. A `KindResolutionError` reason stands for "this
 *   registry cannot satisfy the kind"; anything else thrown stands for a read failure
 */
function fakeRegistry(answers: {
  kind?: Record<string, BlockPackId | KindResolutionError | Error>;
  overview?: Record<string, Record<string, string>>;
}) {
  const kindCalls: { registryId: string; ref: string; allowUnstable: boolean }[] = [];
  const overviewCalls: { registryId: string; id: BlockPackId; channel: string }[] = [];

  const registry: KindAwareRegistry = {
    resolveKind: (registryId, ref, options) => {
      kindCalls.push({ registryId, ref, allowUnstable: options.allowUnstable });
      const answer = answers.kind?.[registryId];
      if (answer === undefined) {
        return Promise.reject(new KindResolutionError("no-matching-kind-version", ref));
      }
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(specIn(`https://${registryId}`, answer));
    },
    getOverview: (registryId, id, channel) => {
      overviewCalls.push({ registryId, id, channel });
      const title = answers.overview?.[registryId]?.[id.name];
      if (title === undefined) return Promise.reject(new Error("no such manifest"));
      return Promise.resolve(overviewOf(`https://${registryId}`, id, title));
    },
  };

  return { registry, kindCalls, overviewCalls };
}

const providerOver = (registry: KindAwareRegistry, registryIds: string[]) =>
  templateBlockPackProvider({ registry, registryIds, logger: silent });

describe("kindCapableRegistryIds", () => {
  const entries: RegistryEntry[] = [
    { id: "main", spec: { type: "remote-v2", url: "https://main" } },
    { id: "local:{/w/blocks}", spec: { type: "local-dev", path: "/w/blocks" } },
    { id: "extra", spec: { type: "remote-v2", url: "https://extra" } },
  ];

  test("keeps the remote registries, in configured order", () => {
    expect(kindCapableRegistryIds(entries)).toEqual(["main", "extra"]);
  });

  test("drops a dev registry, which can never answer a kind", () => {
    // Dev packets have no manifest and no kind publication, and every template entry
    // names a kind — so asking is not a fallback, it is a guaranteed failure that would
    // muddy the reported reason.
    expect(kindCapableRegistryIds([entries[1]])).toEqual([]);
  });
});

describe("byKind", () => {
  test("resolves through the registry and reports the block's published title", async () => {
    const { registry, kindCalls, overviewCalls } = fakeRegistry({
      kind: { main: blockId("demo") },
      overview: { main: { demo: "Demo Block" } },
    });

    const outcome = await providerOver(registry, ["main"]).byKind(KIND, { allowUnstable: false });

    expect(outcome).toEqual({
      ok: true,
      spec: specIn("https://main", blockId("demo")),
      title: "Demo Block",
    });
    // The projection first, then the manifest of the block it picked.
    expect(kindCalls).toEqual([{ registryId: "main", ref: KIND, allowUnstable: false }]);
    expect(overviewCalls).toEqual([{ registryId: "main", id: blockId("demo"), channel: "stable" }]);
  });

  test("passes the selector through unchanged", async () => {
    // The facade's parameter is typed as an exact reference, but resolution parses the
    // version segment as a selector — so `^1.0.0` must arrive verbatim, not normalized.
    const { registry, kindCalls } = fakeRegistry({
      kind: { main: blockId("demo") },
      overview: { main: { demo: "Demo Block" } },
    });

    await providerOver(registry, ["main"]).byKind(KIND, { allowUnstable: true });

    expect(kindCalls[0].ref).toBe("@platforma-open/milaboratories.demo.kind@^1.0.0");
    expect(kindCalls[0].allowUnstable).toBe(true);
  });

  test("falls through to the next registry, first hit winning", async () => {
    const { registry, kindCalls } = fakeRegistry({
      kind: { extra: blockId("demo") },
      overview: { extra: { demo: "Demo Block" } },
    });

    const outcome = await providerOver(registry, ["main", "extra"]).byKind(KIND, {
      allowUnstable: false,
    });

    expect(outcome.ok).toBe(true);
    expect(kindCalls.map((c) => c.registryId)).toEqual(["main", "extra"]);
  });

  test("stops at the first registry that answers", async () => {
    const { registry, kindCalls } = fakeRegistry({
      kind: { main: blockId("demo"), extra: blockId("demo") },
      overview: { main: { demo: "From Main" }, extra: { demo: "From Extra" } },
    });

    const outcome = await providerOver(registry, ["main", "extra"]).byKind(KIND, {
      allowUnstable: false,
    });

    expect(outcome.ok && outcome.title).toBe("From Main");
    expect(kindCalls.map((c) => c.registryId)).toEqual(["main"]);
  });

  test("reports the failure that got furthest when registries disagree", async () => {
    // One registry has never heard of the kind, the other has it but only as a
    // pre-release. Reporting the first would tell the reader to check their spelling,
    // when the actual way out is to import again with unstable allowed.
    const { registry } = fakeRegistry({
      kind: {
        main: new KindResolutionError("no-matching-kind-version", KIND),
        extra: new KindResolutionError("no-stable-implementation", KIND),
      },
    });

    const outcome = await providerOver(registry, ["main", "extra"]).byKind(KIND, {
      allowUnstable: false,
    });

    expect(outcome).toEqual({ ok: false, reason: "no-stable-implementation" });
  });

  test("no registry knowing the kind is not-found, not an error", async () => {
    const { registry } = fakeRegistry({});

    const outcome = await providerOver(registry, ["main", "extra"]).byKind(KIND, {
      allowUnstable: false,
    });

    expect(outcome).toEqual({ ok: false, reason: "no-matching-kind-version" });
  });

  test("no registries at all is not-found rather than a crash", async () => {
    // Reachable: an environment configured with only dev registries.
    const { registry, kindCalls } = fakeRegistry({});

    const outcome = await providerOver(registry, []).byKind(KIND, { allowUnstable: false });

    expect(outcome).toEqual({ ok: false, reason: "no-matching-kind-version" });
    expect(kindCalls).toEqual([]);
  });

  test("an unreadable registry propagates instead of reading as not-found", async () => {
    // An outage is not a statement about the file, and reporting it as "no such kind"
    // would send the reader to edit a file that is correct.
    const { registry } = fakeRegistry({ kind: { main: new Error("ECONNREFUSED") } });

    await expect(
      providerOver(registry, ["main"]).byKind(KIND, { allowUnstable: false }),
    ).rejects.toThrow("ECONNREFUSED");
  });

  test("a picked block whose manifest cannot be read propagates too", async () => {
    // The kind resolved, so this is not a resolution failure — the registry is
    // inconsistent or unreachable, and either way the file is not at fault.
    const { registry } = fakeRegistry({ kind: { main: blockId("demo") } });

    await expect(
      providerOver(registry, ["main"]).byKind(KIND, { allowUnstable: false }),
    ).rejects.toThrow("no such manifest");
  });
});

describe("byExactVersion", () => {
  test("reads the pinned version's manifest for both its spec and its title", async () => {
    const { registry, overviewCalls } = fakeRegistry({
      overview: { main: { demo: "Demo Block" } },
    });

    const outcome = await providerOver(registry, ["main"]).byExactVersion(blockId("demo", "2.0.1"));

    expect(outcome).toEqual({
      ok: true,
      spec: specIn("https://main", blockId("demo", "2.0.1")),
      title: "Demo Block",
    });
    expect(overviewCalls[0].channel).toBe("stable");
  });

  test("tries every registry before giving up", async () => {
    const { registry, overviewCalls } = fakeRegistry({ overview: { extra: { demo: "Demo" } } });

    const outcome = await providerOver(registry, ["main", "extra"]).byExactVersion(blockId("demo"));

    expect(outcome.ok).toBe(true);
    expect(overviewCalls.map((c) => c.registryId)).toEqual(["main", "extra"]);
  });

  test("a version no registry has is reported, not thrown", async () => {
    // The entry pinned it, so this is a statement about the file — and resolution turns
    // it into the message offering both ways out.
    const { registry } = fakeRegistry({});

    expect(await providerOver(registry, ["main"]).byExactVersion(blockId("gone", "9.9.9"))).toEqual(
      { ok: false, reason: "no-such-block-version" },
    );
  });

  test("every registry that could not answer is logged", async () => {
    // The reader throws the same way for an absent block and an unreadable one, so the
    // fallback cannot tell them apart. The log is the only place the reason survives.
    const lines: string[] = [];
    const logger = { info: (m: string) => lines.push(m), warn: () => {}, error: () => {} };
    const { registry } = fakeRegistry({});

    await templateBlockPackProvider({
      registry,
      registryIds: ["main", "extra"],
      logger: logger as unknown as MiLogger,
    }).byExactVersion(blockId("gone", "9.9.9"));

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("milaboratories/gone 9.9.9");
    expect(lines[0]).toContain("'main'");
    expect(lines[0]).toContain("no such manifest");
  });
});
