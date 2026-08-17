import { describe, expect, test } from "vitest";
import type {
  BlockKindSelectorReference,
  BlockPackLocationReference,
  BlockPackLocatorOverride,
  BlockPackReference,
  ProjectTemplateV1,
  ProjectTemplateV1Entry,
} from "@milaboratories/pl-model-common";
import { PROJECT_TEMPLATE_SCHEMA_V1 } from "@milaboratories/pl-model-common";
import type { BlockPackId, BlockPackSpec } from "@milaboratories/pl-model-middle-layer";
import type {
  BlockPackProvider,
  ExactResolution,
  KindResolution,
  LocationResolution,
} from "./template_resolve";
import { parseBlockPackName, resolveTemplateEntries } from "./template_resolve";

/**
 * Resolution stage, driven against a fake provider.
 *
 * No registry, no network, no project: what registry to read and how is on the far
 * side of `BlockPackProvider`, and everything these tests cover — which path an entry
 * takes, what each failure tells the reader, that every entry is attempted — is on
 * this side.
 */

const KIND = "@platforma-open/milaboratories.demo.kind@^1.0.0" as BlockKindSelectorReference;

const specFor = (name: string): BlockPackSpec => ({
  type: "from-registry-v2",
  registryUrl: "https://block.registry.platforma.bio/releases",
  id: { organization: "milaboratories", name, version: "1.2.3" },
  channel: "stable",
});

/** A successful resolution of `name`, titled the way a registry would title it. */
const foundBlock = (name: string) => ({
  ok: true as const,
  spec: specFor(name),
  title: `The ${name} Block`,
});

/**
 * An entry as the parser hands it over, with the locator override left to the caller.
 *
 * `extra` takes {@link BlockPackLocatorOverride} rather than a `Partial<Pick<…>>` of the
 * entry: the latter would let a test hand over both `block` and `location`, which is a
 * document the type forbids and the parser rejects.
 */
const entry = (
  id: string,
  extra: { kind?: BlockKindSelectorReference } & BlockPackLocatorOverride = {},
): ProjectTemplateV1Entry => ({ id, kind: KIND, params: {}, ...extra });

const documentOf = (...blocks: ProjectTemplateV1Entry[]): ProjectTemplateV1 => ({
  schema: PROJECT_TEMPLATE_SCHEMA_V1,
  blocks,
});

/** A provider whose three answers are fixed, recording what it was asked. */
function fakeProvider(answers: {
  byKind?: KindResolution;
  byExactVersion?: ExactResolution;
  byLocation?: LocationResolution;
}): {
  provider: BlockPackProvider;
  kindCalls: { kind: string; allowUnstable: boolean }[];
  exactCalls: BlockPackId[];
  locationCalls: string[];
} {
  const kindCalls: { kind: string; allowUnstable: boolean }[] = [];
  const exactCalls: BlockPackId[] = [];
  const locationCalls: string[] = [];

  return {
    kindCalls,
    exactCalls,
    locationCalls,
    provider: {
      byKind: (kind, options) => {
        kindCalls.push({ kind, allowUnstable: options.allowUnstable });
        return Promise.resolve(answers.byKind ?? foundBlock("resolved"));
      },
      byExactVersion: (id) => {
        exactCalls.push(id);
        return Promise.resolve(answers.byExactVersion ?? foundBlock("pinned"));
      },
      byLocation: (location) => {
        locationCalls.push(location);
        return Promise.resolve(answers.byLocation ?? foundBlock("located"));
      },
    },
  };
}

/** The concrete kind the located block declares, matching {@link KIND}'s selector. */

const LOCATION = "file:///Users/dev/blocks/demo/block" as BlockPackLocationReference;

const resolve = (document: ProjectTemplateV1, provider: BlockPackProvider, allowUnstable = false) =>
  resolveTemplateEntries(document, provider, { allowUnstable });

describe("resolveTemplateEntries", () => {
  test("resolves each entry's kind, in file order", async () => {
    const { provider, kindCalls } = fakeProvider({});

    const outcome = await resolve(documentOf(entry("a"), entry("b")), provider);

    expect(kindCalls).toHaveLength(2);
    expect(outcome.problems).toEqual([]);
    expect(outcome.resolved.map((r) => r.entryId)).toEqual(["a", "b"]);
    expect(outcome.resolved[0].spec).toEqual(specFor("resolved"));
  });

  test("the apply-wide unstable flag reaches every entry", async () => {
    // One decision for the whole file, not per entry: a template that resolved some
    // entries to stable blocks and others to pre-releases would be unreproducible in
    // a way the file itself does not record.
    const { provider, kindCalls } = fakeProvider({});

    await resolve(documentOf(entry("a"), entry("b")), provider, true);

    expect(kindCalls.map((c) => c.allowUnstable)).toEqual([true, true]);
  });

  test("a pinned version bypasses kind resolution entirely", async () => {
    const { provider, kindCalls, exactCalls } = fakeProvider({});
    const pinned = entry("a", {
      block: "@platforma-open/milaboratories.demo@2.0.1" as BlockPackReference,
    });

    const outcome = await resolve(documentOf(pinned), provider);

    expect(kindCalls).toEqual([]);
    expect(exactCalls).toEqual([
      { organization: "milaboratories", name: "demo", version: "2.0.1" },
    ]);
    expect(outcome.resolved[0]).toEqual({
      entryId: "a",
      spec: specFor("pinned"),
      title: "The pinned Block",
      pinned: true,
    });
  });

  test("both paths produce the same kind of result", async () => {
    // Everything downstream of resolution — preparation, construction — must not care
    // which way an entry got its block.
    const { provider } = fakeProvider({});

    const outcome = await resolve(
      documentOf(
        entry("a"),
        entry("b", { block: "@platforma-open/milaboratories.demo@2.0.1" as BlockPackReference }),
      ),
      provider,
    );

    expect(outcome.resolved.map((r) => Object.keys(r).sort())).toEqual([
      ["entryId", "pinned", "spec", "title"],
      ["entryId", "pinned", "spec", "title"],
    ]);
  });

  test("the block's published title comes back with it, whichever route it took", async () => {
    // It becomes the created block's label, and this is the only stage that can know it:
    // a prepared block pack carries the model, the workflow and the frontend, none of
    // which names the block. Deriving it from the entry would put a UUID there, since an
    // exported template names its entries by the source project's block ids.
    const { provider } = fakeProvider({});

    const outcome = await resolve(
      documentOf(
        entry("aaaaaaaa-0000-4000-8000-000000000001"),
        entry("bbbbbbbb-0000-4000-8000-000000000002", {
          block: "@platforma-open/milaboratories.demo@2.0.1" as BlockPackReference,
        }),
      ),
      provider,
    );

    expect(outcome.resolved.map((r) => r.title)).toEqual([
      "The resolved Block",
      "The pinned Block",
    ]);
  });

  test("every entry is attempted, and every failure collected", async () => {
    // Fixing an unapplicable file should take one pass, not one pass per bad entry.
    const { provider } = fakeProvider({ byKind: { ok: false, reason: "no-implementation" } });

    const outcome = await resolve(documentOf(entry("a"), entry("b"), entry("c")), provider);

    expect(outcome.problems.map((p) => p.entryId)).toEqual(["a", "b", "c"]);
    expect(outcome.resolved).toEqual([]);
  });

  test("a document that half resolves reports both halves", async () => {
    // `resolved` being shorter than the document is the signal that it must not be
    // applied — resolution is all-or-nothing for the caller, not per entry.
    const provider: BlockPackProvider = {
      byKind: () => Promise.resolve(foundBlock("resolved")),
      byExactVersion: () => Promise.resolve({ ok: false, reason: "no-such-block-version" }),
      byLocation: () => Promise.resolve({ ok: false, reason: "not-found" }),
    };

    const outcome = await resolve(
      documentOf(
        entry("a"),
        entry("b", { block: "@platforma-open/milaboratories.gone@9.9.9" as BlockPackReference }),
      ),
      provider,
    );

    expect(outcome.resolved.map((r) => r.entryId)).toEqual(["a"]);
    expect(outcome.problems.map((p) => p.entryId)).toEqual(["b"]);
  });

  test("an empty document resolves to nothing at all", async () => {
    const { provider, kindCalls } = fakeProvider({});

    expect(await resolve(documentOf(), provider)).toEqual({ resolved: [], problems: [] });
    expect(kindCalls).toEqual([]);
  });
});

describe("an entry that says where its block is", () => {
  test("reads that place, and consults no registry at all", async () => {
    const { provider, kindCalls, exactCalls, locationCalls } = fakeProvider({});

    const outcome = await resolve(documentOf(entry("a", { location: LOCATION })), provider);

    expect(locationCalls).toEqual([LOCATION]);
    expect(kindCalls).toEqual([]);
    expect(exactCalls).toEqual([]);
    expect(outcome.problems).toEqual([]);
    expect(outcome.resolved[0]).toEqual({
      entryId: "a",
      spec: specFor("located"),
      title: "The located Block",
      pinned: true,
    });
  });

  test("a located entry looks like any other downstream", async () => {
    // Preparation and construction must not be able to tell how an entry found its
    // block — that convergence is what lets an unpublished block travel the same path.
    const { provider } = fakeProvider({});

    const outcome = await resolve(
      documentOf(entry("a"), entry("b", { location: LOCATION })),
      provider,
    );

    expect(outcome.resolved.map((r) => Object.keys(r).sort())).toEqual([
      ["entryId", "pinned", "spec", "title"],
      ["entryId", "pinned", "spec", "title"],
    ]);
  });

  test("the location wins over a kind, which is the point of naming a place", async () => {
    const { provider, kindCalls, locationCalls } = fakeProvider({});

    await resolve(documentOf(entry("a", { location: LOCATION })), provider);

    expect(locationCalls).toHaveLength(1);
    expect(kindCalls).toEqual([]);
  });

  describe("what each failure tells the reader", () => {
    const messageFor = async (answer: LocationResolution) => {
      const { provider } = fakeProvider({ byLocation: answer });
      const outcome = await resolve(documentOf(entry("a", { location: LOCATION })), provider);
      return outcome.problems[0].error;
    };

    test("a scheme this application cannot read says so, and names what it can", async () => {
      // Distinct from "nothing there": the file may be perfectly correct and simply
      // written for a consumer that fetches more than this one does.
      const message = await messageFor({ ok: false, reason: "unsupported-scheme" });

      expect(message).toMatch(/cannot read/);
      expect(message).toContain("file:");
      expect(message).toContain(LOCATION);
    });

    test("a missing folder names the reason a pinned template travels badly", async () => {
      const message = await messageFor({ ok: false, reason: "not-found" });

      expect(message).toMatch(/Nothing is at/);
      expect(message).toMatch(/only works on the machine/);
    });

    test("a folder that is not a block says what was looked for", async () => {
      // Reachable by pointing one directory off, so the message has to be actionable
      // rather than just negative.
      const message = await messageFor({ ok: false, reason: "not-a-block" });

      expect(message).toMatch(/is not a block/);
      expect(message).toMatch(/package\.json/);
    });
  });
});

describe("what each failure tells the reader", () => {
  const messageFor = async (answer: KindResolution) => {
    const { provider } = fakeProvider({ byKind: answer });
    const outcome = await resolve(documentOf(entry("a")), provider);
    return outcome.problems[0].error;
  };

  test("no matching kind version points at the file or the registry", async () => {
    const message = await messageFor({ ok: false, reason: "no-matching-kind-version" });

    // The kind's own name, not just the raw reference: the reference is what they
    // wrote, the name is what they look for in a registry.
    expect(message).toContain("@platforma-open/milaboratories.demo.kind");
    expect(message).toContain(KIND);
    expect(message).toMatch(/Check the version, or update the block registry/);
  });

  test("no implementation says nothing can be installed yet", async () => {
    const message = await messageFor({ ok: false, reason: "no-implementation" });

    expect(message).toMatch(/no block implementing/);
  });

  test("only unstable implementations names the one action that needs no edit", async () => {
    // This is the reason the allow-unstable checkbox exists, and the only failure a
    // user can clear without touching the file.
    const message = await messageFor({ ok: false, reason: "no-stable-implementation" });

    expect(message).toMatch(/pre-release/);
    expect(message).toMatch(/Import again with unstable versions allowed/);
  });

  test("a missing pinned version offers both ways out", async () => {
    // Correct the pin, or drop it — the second one is easy to miss, and is usually
    // what the reader wants.
    const { provider } = fakeProvider({
      byExactVersion: { ok: false, reason: "no-such-block-version" },
    });

    const outcome = await resolve(
      documentOf(
        entry("a", { block: "@platforma-open/milaboratories.demo@2.0.1" as BlockPackReference }),
      ),
      provider,
    );

    expect(outcome.problems[0].error).toContain("milaboratories/demo");
    expect(outcome.problems[0].error).toContain("2.0.1");
    expect(outcome.problems[0].error).toMatch(/remove it so a version is chosen automatically/);
  });

  test("an unreadable pinned name is a problem, not a throw", async () => {
    // Reachable from a hand-written file: the document parser checks the
    // `{name}@X.Y.Z` grammar but not that the name carries an organization.
    const { provider } = fakeProvider({});

    const outcome = await resolve(
      documentOf(entry("a", { block: "@platforma-open/demo@2.0.1" as BlockPackReference })),
      provider,
    );

    expect(outcome.problems[0].entryId).toBe("a");
    expect(outcome.problems[0].error).toMatch(/Pinned block version is not readable/);
  });
});

describe("parseBlockPackName", () => {
  test("splits the organization out of the npm name", () => {
    // The npm scope and the organization are different, and only the organization
    // reaches the registry.
    expect(parseBlockPackName("@milaboratories/milaboratories.test-download-file")).toEqual({
      organization: "milaboratories",
      name: "test-download-file",
    });
    expect(parseBlockPackName("@platforma-open/milaboratories.mixcr-clonotyping")).toEqual({
      organization: "milaboratories",
      name: "mixcr-clonotyping",
    });
  });

  test("splits on the first dot, so a name may contain more", () => {
    expect(parseBlockPackName("@scope/org.a.b")).toEqual({ organization: "org", name: "a.b" });
  });

  test("rejects a name that cannot address a registry", () => {
    expect(() => parseBlockPackName("no-scope.name")).toThrow(/expected '@npm-scope/);
    expect(() => parseBlockPackName("@scope/nodot")).toThrow(/does not separate an organization/);
    expect(() => parseBlockPackName("@scope/.name")).toThrow(/does not separate an organization/);
    expect(() => parseBlockPackName("@scope/org.")).toThrow(/does not separate an organization/);
  });
});
